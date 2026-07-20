// Enterprise Security Utility - AES-256-GCM Secret Encryption, Server-Side OTP Hashing, & SMTP Mailer
import * as crypto from 'crypto';
import * as net from 'net';
import * as tls from 'tls';
import { Logger } from './logger';

const MASTER_KEY_STRING = process.env.ENCRYPTION_KEY || 'homelab-2fa-smtp-master-secret-key-32b-seed';
const MASTER_KEY = crypto.createHash('sha256').update(MASTER_KEY_STRING).digest(); // 32 bytes

export interface SMTPConfig {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string; // Plaintext when executing SMTP, encrypted in DB
  senderEmail: string;
  senderName: string;
}

interface OTPEntry {
  hash: string;
  expiresAt: number;
  attempts: number;
}

// In-memory store for server-side OTP hashes (keyed by email)
const otpStore = new Map<string, OTPEntry>();

/**
 * Encrypt a sensitive password using AES-256-GCM
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err: any) {
    Logger.error('Security', `Encryption failure: ${err.message}`);
    throw new Error('Failed to encrypt secret key');
  }
}

/**
 * Decrypt an AES-256-GCM encrypted payload
 */
export function decryptSecret(payload: string): string {
  if (!payload || !payload.startsWith('enc:gcm:')) {
    return payload; // Return as-is if unencrypted legacy format
  }
  try {
    const parts = payload.split(':');
    if (parts.length !== 5) return payload;
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedText = parts[4];

    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    Logger.error('Security', `Decryption failure: ${err.message}`);
    return '';
  }
}

/**
 * Generate a 6-digit server-side OTP with SHA-256 hash storage (5 minute TTL)
 * The plaintext OTP is NEVER sent in HTTP API responses.
 */
export function generateServerOTP(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const rawOtp = crypto.randomInt(100000, 999999).toString();
  
  // Compute SHA-256 hash with salt
  const hash = crypto
    .createHash('sha256')
    .update(`${rawOtp}:${normalizedEmail}:homelab-otp-salt`)
    .digest('hex');

  otpStore.set(normalizedEmail, {
    hash,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
    attempts: 0
  });

  Logger.info('Security', `Server-side OTP hash generated for ${normalizedEmail} (TTL: 5m)`);
  return rawOtp;
}

/**
 * Strictly verify a user-submitted OTP code against the server-side SHA-256 hash.
 */
export function verifyServerOTP(email: string, userEnteredOtp: string): { valid: boolean; message: string } {
  const normalizedEmail = email.toLowerCase().trim();
  const entry = otpStore.get(normalizedEmail);

  if (!entry) {
    return { valid: false, message: 'OTP expired or not requested. Please request a new code.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return { valid: false, message: 'OTP code has expired. Please request a new 6-digit code.' };
  }

  if (entry.attempts >= 5) {
    otpStore.delete(normalizedEmail);
    return { valid: false, message: 'Too many invalid attempts. OTP invalidated.' };
  }

  entry.attempts += 1;

  const targetHash = crypto
    .createHash('sha256')
    .update(`${userEnteredOtp.trim()}:${normalizedEmail}:homelab-otp-salt`)
    .digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(entry.hash), Buffer.from(targetHash))) {
    // Valid! Delete OTP to prevent replay attacks
    otpStore.delete(normalizedEmail);
    return { valid: true, message: 'OTP successfully verified server-side.' };
  }

  return { valid: false, message: 'Invalid OTP code. Please check your email and try again.' };
}

/**
 * Send an email via SMTP (STARTTLS / Direct TLS socket)
 * Properly implements RFC 3207 STARTTLS: waits for TLS secureConnect before
 * sending fresh EHLO, then AUTH PLAIN — fixing Gmail auth rejection.
 */
export async function sendSMTPEmail(config: SMTPConfig, toEmail: string, subject: string, htmlBody: string): Promise<boolean> {
  Logger.info('SMTP', `Initiating SMTP mail transport to ${toEmail} via ${config.smtpHost}:${config.smtpPort}`);

  return new Promise((resolve) => {
    let socket: net.Socket | tls.TLSSocket;
    let resolved = false;

    const cleanup = (success: boolean, msg: string) => {
      if (resolved) return;
      resolved = true;
      if (socket && !socket.destroyed) socket.destroy();
      if (success) {
        Logger.info('SMTP', `Email successfully delivered to ${toEmail}: ${msg}`);
      } else {
        Logger.error('SMTP', `SMTP delivery failed: ${msg}`);
      }
      resolve(success);
    };

    const sendLine = (line: string) => {
      Logger.debug('SMTP', `>> ${line.trim()}`);
      socket.write(`${line}\r\n`);
    };

    try {
      const port = Number(config.smtpPort) || 587;
      const isDirectTLS = port === 465;
      let step = 0;

      const processData = (data: Buffer) => {
        const response = data.toString().trim();
        Logger.debug('SMTP', `<< ${response}`);

        // Step 0: Server greeting 220
        if (step === 0 && response.startsWith('220')) {
          sendLine(`EHLO homelab`);
          step = 1;

        // Step 1: EHLO response — decide STARTTLS or direct auth
        } else if (step === 1 && response.startsWith('250')) {
          if (!isDirectTLS && response.includes('STARTTLS')) {
            sendLine(`STARTTLS`);
            step = 2;
          } else {
            const authStr = Buffer.from(`\0${config.smtpUser}\0${config.smtpPass}`).toString('base64');
            sendLine(`AUTH PLAIN ${authStr}`);
            step = 4;
          }

        // Step 2: STARTTLS acknowledged — upgrade socket to TLS
        } else if (step === 2 && response.startsWith('220')) {
          socket.removeAllListeners('data');
          socket.removeAllListeners('error');
          socket.removeAllListeners('timeout');

          const tlsSocket = tls.connect({
            socket: socket as net.Socket,
            host: config.smtpHost,
            rejectUnauthorized: false
          });

          socket = tlsSocket;

          // CRITICAL: Wait for full TLS handshake before writing ANYTHING
          tlsSocket.once('secureConnect', () => {
            Logger.info('SMTP', 'TLS handshake complete. Sending post-STARTTLS EHLO.');
            tlsSocket.write(`EHLO homelab\r\n`);
            step = 3;
          });

          tlsSocket.on('data', processData);
          tlsSocket.on('error', (err) => cleanup(false, `TLS socket error: ${err.message}`));
          tlsSocket.setTimeout(10000, () => cleanup(false, 'TLS socket timeout'));
          return;

        // Step 3: Post-STARTTLS EHLO response — now send AUTH PLAIN
        } else if (step === 3 && response.startsWith('250')) {
          const authStr = Buffer.from(`\0${config.smtpUser}\0${config.smtpPass}`).toString('base64');
          sendLine(`AUTH PLAIN ${authStr}`);
          step = 4;

        // Step 4: AUTH accepted (235)
        } else if (step === 4 && response.startsWith('235')) {
          sendLine(`MAIL FROM:<${config.senderEmail || config.smtpUser}>`);
          step = 5;

        // Step 5: MAIL FROM accepted
        } else if (step === 5 && response.startsWith('250')) {
          sendLine(`RCPT TO:<${toEmail}>`);
          step = 6;

        // Step 6: RCPT TO accepted
        } else if (step === 6 && response.startsWith('250')) {
          sendLine(`DATA`);
          step = 7;

        // Step 7: DATA command accepted (354)
        } else if (step === 7 && response.startsWith('354')) {
          const rawMessage = [
            `From: "${config.senderName || 'HomeLab Security'}" <${config.senderEmail || config.smtpUser}>`,
            `To: <${toEmail}>`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=utf-8`,
            ``,
            htmlBody,
            `.`
          ].join('\r\n');
          socket.write(`${rawMessage}\r\n`);
          step = 8;

        // Step 8: Message accepted (250)
        } else if (step === 8 && response.startsWith('250')) {
          sendLine(`QUIT`);
          cleanup(true, '250 Message accepted and delivered');

        // Explicit auth failure
        } else if (response.startsWith('535')) {
          cleanup(false, `AUTH failed (535): Incorrect App Password or username. Response: ${response}`);

        // Other SMTP 5xx fatal errors
        } else if (response.startsWith('5')) {
          cleanup(false, `SMTP server error at step ${step}: ${response}`);
        }
      };

      if (isDirectTLS) {
        socket = tls.connect({ host: config.smtpHost, port, rejectUnauthorized: false }, () => {
          Logger.info('SMTP', 'Direct TLS connected.');
        });
      } else {
        socket = net.createConnection({ host: config.smtpHost, port }, () => {
          Logger.info('SMTP', `TCP connected to ${config.smtpHost}:${port}. Awaiting server greeting...`);
        });
      }

      socket.setTimeout(10000, () => cleanup(false, 'Initial SMTP connection timeout'));
      socket.on('error', (err) => cleanup(false, `Socket error: ${err.message}`));
      socket.on('data', processData);

    } catch (err: any) {
      cleanup(false, err.message);
    }
  });
}
