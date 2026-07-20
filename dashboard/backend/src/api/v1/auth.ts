// Authentication and Session REST Subsystem API routes
import { CoreEngine } from '../../core/engine';
import { verifyServerOTP, generateServerOTP, sendSMTPEmail, SMTPConfig, decryptSecret } from '../../utils/security';
import { Logger } from '../../utils/logger';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. POST: /api/v1/auth/login (Verify credentials — enforces 2FA OTP challenge if enabled)
  fastify.post('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const { username, password } = request.body || {};

    // Query repository to provide user-friendly specific error details
    const user = engine.usersRepo.findByUsername(username);
    if (!user) {
      return reply.status(401).send({ error: 'Incorrect username or password' });
    }

    const token = engine.auth.login(username, password);
    if (!token) {
      return reply.status(401).send({ error: 'Incorrect password' });
    }

    // --- 2FA ENFORCEMENT ---
    const twoFAEnabled = engine.settingsRepo.get('2fa.enabled') === 'true';
    if (twoFAEnabled) {
      const recipientEmail = engine.settingsRepo.get('2fa.email') || engine.settingsRepo.get('smtp.user');
      if (recipientEmail) {
        // Dispatch OTP to registered 2FA email
        const encPass = engine.settingsRepo.get('smtp.pass') || '';
        const smtpConfig: SMTPConfig = {
          provider: engine.settingsRepo.get('smtp.provider') || 'Custom SMTP',
          smtpHost: engine.settingsRepo.get('smtp.host') || 'localhost',
          smtpPort: Number(engine.settingsRepo.get('smtp.port')) || 587,
          smtpUser: engine.settingsRepo.get('smtp.user') || '',
          smtpPass: decryptSecret(encPass),
          senderEmail: engine.settingsRepo.get('smtp.senderEmail') || engine.settingsRepo.get('smtp.user') || '',
          senderName: engine.settingsRepo.get('smtp.senderName') || 'HomeLab 2FA Security'
        };
        const rawOtp = generateServerOTP(recipientEmail);
        const htmlBody = `
          <div style="font-family:monospace;background:#0e0e11;color:#fff;padding:28px;border:2px solid #fff;max-width:500px;margin:0 auto;">
            <div style="margin-bottom:16px;border-bottom:2px solid #fff;padding-bottom:12px;">
              <span style="background:#fff;color:#000;font-weight:900;padding:4px 10px;font-size:1.1rem;margin-right:8px;display:inline-block;">H</span>
              <span style="color:#fff;font-weight:900;font-size:1.1rem;text-transform:uppercase;letter-spacing:.05em;">HOMELAB OS 2FA SECURITY</span>
            </div>
            <p style="color:#a1a1aa;font-size:.85rem;line-height:1.5;margin-bottom:1.5rem;">A login attempt was detected. Enter the 6-digit code below to complete authentication:</p>
            <div style="text-align:center;margin:20px 0;">
              <div style="font-size:32px;font-weight:900;letter-spacing:8px;background:#000;color:#22c55e;border:2px solid #fff;padding:14px 28px;display:inline-block;">${rawOtp}</div>
            </div>
            <p style="color:#a1a1aa;font-size:.72rem;line-height:1.5;margin-top:1.5rem;border-top:1px dashed #33333e;padding-top:12px;">This OTP is valid for 5 minutes. If you did not attempt to login, secure your account immediately.</p>
          </div>`;
        sendSMTPEmail(smtpConfig, recipientEmail, 'HomeLab OS - Login 2FA Verification Code', htmlBody)
          .catch(err => Logger.error('Auth2FA', `Failed to dispatch login OTP: ${err.message}`));
      }
      // Return a 2fa_required challenge — DO NOT return the real JWT yet
      return reply.status(202).send({ twoFARequired: true, message: '2FA OTP dispatched to your registered email. Enter the code to complete login.' });
    }

    return { token };
  });

  // 2. POST: /api/v1/auth/2fa-verify (Validate login OTP and issue real JWT)
  fastify.post('/api/v1/auth/2fa-verify', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'otp'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
          otp: { type: 'string' }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const { username, password, otp } = request.body || {};

    // Re-verify credentials (never trust client-side state)
    const token = engine.auth.login(username, password);
    if (!token) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const recipientEmail = engine.settingsRepo.get('2fa.email') || engine.settingsRepo.get('smtp.user');
    if (!recipientEmail) {
      return reply.status(400).send({ error: '2FA email not configured' });
    }

    const result = verifyServerOTP(recipientEmail, otp);
    if (!result.valid) {
      return reply.status(401).send({ error: result.message });
    }

    Logger.info('Auth2FA', `2FA login OTP verified for user [${username}]`);
    engine.auditRepo.log(username, '2fa_login_verified', 'security', username);
    return { token };
  });

  // 3. GET: /api/v1/auth/me (Extract profile state from Bearer token)
  fastify.get('/api/v1/auth/me', async (request: any, reply: any) => {
    const authHeader = request.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const user = engine.auth.verifyToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }
    const dbUser = engine.usersRepo.findById(user.id);
    if (!dbUser) {
      return reply.status(401).send({ error: 'User no longer exists' });
    }
    return {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      displayName: dbUser.displayName
    };
  });

  // 3. GET: /api/v1/auth/setup-status (Check if system requires first-time initialization setup)
  fastify.get('/api/v1/auth/setup-status', async () => {
    const users = engine.usersRepo.findAll().filter((u) => u.username !== 'system');
    return { setupRequired: users.length === 0 };
  });

  // 4. POST: /api/v1/auth/setup (Configure the first Super Admin user account during first startup setup wizard)
  fastify.post('/api/v1/auth/setup', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password', 'displayName'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 30 },
          password: { type: 'string', minLength: 6 },
          displayName: { type: 'string', minLength: 1, maxLength: 50 }
        }
      }
    }
  }, async (request: any, reply: any) => {
    const users = engine.usersRepo.findAll().filter((u) => u.username !== 'system');
    if (users.length > 0) {
      return reply.status(400).send({ error: 'Initialization setup is already complete' });
    }

    const { username, password, displayName } = request.body || {};

    try {
      const hashedPassword = engine.auth.hashPassword(password);
      const createdUser = engine.usersRepo.create({
        id: 'admin', // use standard admin ID to satisfy foreign keys
        username,
        password: hashedPassword,
        displayName,
        role: 'admin',
        avatar: ''
      });

      return {
        success: true,
        user: { id: createdUser.id, username: createdUser.username, role: createdUser.role }
      };
    } catch (err: any) {
      return reply.status(500).send({ error: `Setup initialization failed: ${err.message}` });
    }
  });
}
