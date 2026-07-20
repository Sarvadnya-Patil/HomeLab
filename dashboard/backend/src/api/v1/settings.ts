// Settings preferences, SMTP encryption, 2FA OTP verification, & security audit API routes
import { CoreEngine } from '../../core/engine';
import {
  encryptSecret,
  decryptSecret,
  generateServerOTP,
  verifyServerOTP,
  sendSMTPEmail,
  SMTPConfig
} from '../../utils/security';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Settings preferences list query (Masks encrypted passwords)
  fastify.get('/api/v1/settings', async () => {
    const all = engine.settingsRepo.findAll();
    return all.map(item => {
      if (item.key === 'smtp.pass' && item.value) {
        return {
          ...item,
          value: '••••••••',
          isEncrypted: true
        };
      }
      return item;
    });
  });

  // 2. Settings preferences updating
  fastify.put('/api/v1/settings', async (request: any) => {
    const prefs = request.body || {};
    for (const key of Object.keys(prefs)) {
      let val = prefs[key].value;
      const group = prefs[key].groupName || 'general';
      // Encrypt SMTP password before saving to DB
      if (key === 'smtp.pass' && val && val !== '••••••••') {
        val = encryptSecret(val);
      }
      engine.settingsRepo.set(key, val, group);
    }
    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'update_settings', 'system', 'preferences');
    return { success: true };
  });

  // 3. 2FA & SMTP Status Query
  fastify.get('/api/v1/settings/2fa/status', async () => {
    const enabledVal = engine.settingsRepo.get('2fa.enabled');
    const provider = engine.settingsRepo.get('smtp.provider') || 'Custom SMTP';
    const smtpHost = engine.settingsRepo.get('smtp.host') || '';
    const smtpPort = engine.settingsRepo.get('smtp.port') || '587';
    const smtpUser = engine.settingsRepo.get('smtp.user') || '';
    const senderEmail = engine.settingsRepo.get('smtp.senderEmail') || '';
    const senderName = engine.settingsRepo.get('smtp.senderName') || 'HomeLab OS';
    const targetEmail = engine.settingsRepo.get('2fa.email') || smtpUser || '';
    const hasPass = Boolean(engine.settingsRepo.get('smtp.pass'));

    return {
      enabled: enabledVal === 'true',
      provider,
      smtpHost,
      smtpPort,
      smtpUser,
      senderEmail,
      senderName,
      targetEmail,
      hasPassword: hasPass
    };
  });

  // 4. Save & Encrypt SMTP Config
  fastify.post('/api/v1/settings/smtp', async (request: any, reply: any) => {
    const { provider, smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, senderName, targetEmail } = request.body || {};
    
    if (!smtpHost || !smtpUser) {
      return reply.status(400).send({ error: 'SMTP Host and Username/Email are required.' });
    }

    engine.settingsRepo.set('smtp.provider', provider || 'Custom SMTP', 'smtp');
    engine.settingsRepo.set('smtp.host', smtpHost, 'smtp');
    engine.settingsRepo.set('smtp.port', String(smtpPort || 587), 'smtp');
    engine.settingsRepo.set('smtp.user', smtpUser, 'smtp');
    engine.settingsRepo.set('smtp.senderEmail', senderEmail || smtpUser, 'smtp');
    engine.settingsRepo.set('smtp.senderName', senderName || 'HomeLab OS', 'smtp');
    if (targetEmail) {
      engine.settingsRepo.set('2fa.email', targetEmail, 'security');
    }

    // Encrypt password only if a new non-masked password was entered
    if (smtpPass && smtpPass !== '••••••••') {
      const encrypted = encryptSecret(smtpPass);
      engine.settingsRepo.set('smtp.pass', encrypted, 'smtp');
    }

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'update_smtp_config', 'security', 'smtp');

    return { success: true, message: 'SMTP Configuration saved and password encrypted securely.' };
  });

  // 5. Send 2FA Verification OTP via SMTP (SERVER-SIDE ONLY)
  fastify.post('/api/v1/settings/2fa/send-otp', async (request: any, reply: any) => {
    const { targetEmail } = request.body || {};
    const recipientEmail = targetEmail || engine.settingsRepo.get('2fa.email') || engine.settingsRepo.get('smtp.user');

    if (!recipientEmail) {
      return reply.status(400).send({ error: 'Recipient email address is required to send 2FA OTP.' });
    }

    const encPass = engine.settingsRepo.get('smtp.pass') || '';
    const rawPass = decryptSecret(encPass);
    const smtpHost = engine.settingsRepo.get('smtp.host') || 'localhost';
    const smtpPort = Number(engine.settingsRepo.get('smtp.port')) || 587;
    const smtpUser = engine.settingsRepo.get('smtp.user') || '';

    const smtpConfig: SMTPConfig = {
      provider: engine.settingsRepo.get('smtp.provider') || 'Custom SMTP',
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass: rawPass,
      senderEmail: engine.settingsRepo.get('smtp.senderEmail') || smtpUser,
      senderName: engine.settingsRepo.get('smtp.senderName') || 'HomeLab 2FA Security'
    };

    // Generate 6-digit OTP and store SHA-256 hash server-side
    const rawOtp = generateServerOTP(recipientEmail);

    const htmlBody = `
      <div style="font-family: monospace; background: #0e0e11; color: #ffffff; padding: 20px; border: 2px solid #ffffff;">
        <h2 style="color: #ffffff; border-bottom: 2px solid #ffffff; padding-bottom: 8px;">HOMELAB OS - 2FA VERIFICATION OTP</h2>
        <p style="color: #a1a1aa;">Use the following 6-digit One-Time Password to verify and activate Two-Factor Authentication:</p>
        <div style="font-size: 28px; font-weight: 900; letter-spacing: 6px; background: #000000; color: #22c55e; border: 2px solid #ffffff; padding: 12px 24px; display: inline-block; margin: 15px 0;">
          ${rawOtp}
        </div>
        <p style="color: #a1a1aa; font-size: 12px;">This OTP is valid for 5 minutes. Do NOT share this code with anyone.</p>
      </div>
    `;

    await sendSMTPEmail(smtpConfig, recipientEmail, 'HomeLab OS - 2FA Activation Verification Code', htmlBody);

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'send_2fa_otp', 'security', recipientEmail);

    // CRITICAL SECURITY: Plaintext OTP is NEVER returned in API response!
    return {
      success: true,
      message: `Verification OTP dispatched to ${recipientEmail}. Check your inbox.`,
      email: recipientEmail
    };
  });

  // 6. Verify 2FA OTP (STRICT SERVER-SIDE COMPARISON)
  fastify.post('/api/v1/settings/2fa/verify-otp', async (request: any, reply: any) => {
    const { targetEmail, otp } = request.body || {};
    const recipientEmail = targetEmail || engine.settingsRepo.get('2fa.email') || engine.settingsRepo.get('smtp.user');

    if (!recipientEmail || !otp) {
      return reply.status(400).send({ error: 'Email and 6-digit OTP code are required.' });
    }

    // Perform strict server-side constant-time SHA-256 verification
    const result = verifyServerOTP(recipientEmail, otp);

    if (!result.valid) {
      return reply.status(400).send({ error: result.message });
    }

    // OTP Verified! Enable 2FA in DB
    engine.settingsRepo.set('2fa.enabled', 'true', 'security');
    engine.settingsRepo.set('2fa.email', recipientEmail, 'security');

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'enable_2fa', 'security', recipientEmail);

    return {
      success: true,
      verified: true,
      message: '2FA Two-Factor Authentication successfully verified and enabled!'
    };
  });

  // 7. Disable 2FA
  fastify.post('/api/v1/settings/2fa/disable', async (request: any) => {
    engine.settingsRepo.set('2fa.enabled', 'false', 'security');
    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'disable_2fa', 'security', '2fa');
    return { success: true, message: '2FA has been disabled.' };
  });

  // 8. Security audit log retrieval
  fastify.get('/api/v1/audit', async (request: any) => {
    const limit = Number(request.query.limit) || 100;
    return engine.auditRepo.findAll(limit);
  });
}
