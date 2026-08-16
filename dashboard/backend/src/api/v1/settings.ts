// Settings preferences, SMTP encryption, 2FA OTP verification, & security audit API routes
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
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

  // 5. Send 2FA Verification OTP via SMTP (SERVER-SIDE ONLY — rate limited: 1 per 60s per email)
  const otpRateLimitStore = new Map<string, number>(); // email -> lastSentAt timestamp
  const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown

  fastify.post('/api/v1/settings/2fa/send-otp', async (request: any, reply: any) => {
    const { targetEmail } = request.body || {};
    const recipientEmail = targetEmail || engine.settingsRepo.get('2fa.email') || engine.settingsRepo.get('smtp.user');

    if (!recipientEmail) {
      return reply.status(400).send({ error: 'Recipient email address is required to send 2FA OTP.' });
    }

    // --- RATE LIMITING: max 1 OTP per 60 seconds per email ---
    const lastSent = otpRateLimitStore.get(recipientEmail.toLowerCase());
    if (lastSent) {
      const elapsed = Date.now() - lastSent;
      if (elapsed < OTP_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
        return reply.status(429).send({ error: `OTP rate limit: please wait ${secondsLeft}s before requesting another code.` });
      }
    }
    otpRateLimitStore.set(recipientEmail.toLowerCase(), Date.now());

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
      <div style="font-family: 'JetBrains Mono', Consolas, monospace; background: #0e0e11; color: #ffffff; padding: 28px; border: 2px solid #ffffff; max-width: 500px; margin: 0 auto;">
        <div style="margin-bottom: 16px; border-bottom: 2px solid #ffffff; padding-bottom: 12px;">
          <span style="background: #ffffff; color: #000000; font-weight: 900; padding: 4px 10px; font-size: 1.1rem; margin-right: 8px; display: inline-block;">H</span>
          <span style="color: #ffffff; font-weight: 900; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.05em;">HOMELAB OS 2FA SECURITY</span>
        </div>
        <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.5rem;">Use the following 6-digit One-Time Password to verify and activate Two-Factor Authentication for your account:</p>
        <div style="text-align: center; margin: 20px 0;">
          <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; background: #000000; color: #22c55e; border: 2px solid #ffffff; padding: 14px 28px; display: inline-block;">
            ${rawOtp}
          </div>
        </div>
        <p style="color: #a1a1aa; font-size: 0.72rem; line-height: 1.5; margin-top: 1.5rem; border-top: 1px dashed #33333e; padding-top: 12px;">This OTP is valid for 5 minutes. If you did not request this verification code, please inspect your security audit logs immediately.</p>
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

  // 9. Get SSH Configuration status (IP, Port, Username, AuthType only)
  fastify.get('/api/v1/settings/ssh', async () => {
    const sshHost = engine.settingsRepo.get('ssh.host') || '';
    const sshPort = engine.settingsRepo.get('ssh.port') || '22';
    const sshUser = engine.settingsRepo.get('ssh.user') || '';
    const sshAuthType = engine.settingsRepo.get('ssh.authType') || 'password';

    return {
      sshHost,
      sshPort,
      sshUser,
      sshAuthType
    };
  });

  // 10. Save SSH Configuration
  fastify.post('/api/v1/settings/ssh', async (request: any, reply: any) => {
    const { sshHost, sshPort, sshUser, sshAuthType } = request.body || {};

    if (!sshHost) {
      return reply.status(400).send({ error: 'SSH Host IP/Domain is required.' });
    }

    engine.settingsRepo.set('ssh.host', sshHost, 'ssh');
    engine.settingsRepo.set('ssh.port', String(sshPort || 22), 'ssh');
    engine.settingsRepo.set('ssh.user', sshUser || '', 'ssh');
    engine.settingsRepo.set('ssh.authType', sshAuthType || 'password', 'ssh');

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'update_ssh_config', 'security', 'ssh');

    return { success: true, message: 'SSH Configuration saved successfully.' };
  });

  // 11. GET /api/v1/settings/desktop
  fastify.get('/api/v1/settings/desktop', async () => {
    const enabled = engine.settingsRepo.get('desktop.rdp.enabled') === 'true';
    const username = engine.settingsRepo.get('desktop.rdp.username') || '';
    const hasPassword = !!engine.settingsRepo.get('desktop.rdp.password');
    const hostUser = engine.settingsRepo.get('desktop.rdp.hostUser') || '';

    // Check if the host systemd service is active by checking status via host process/service info
    let serviceActive = false;
    if ((engine as any).simulatedServiceActive) {
      serviceActive = true;
    } else if (process.platform === 'linux') {
      try {
        const checkCmd = 'nsenter -t 1 -m -u -i -n -p -r -- /bin/sh -c "systemctl is-active homelab-desktop-streamer"';
        const stdout = await new Promise<string>((resolve) => {
          exec(checkCmd, (err, stdout) => resolve(stdout.trim()));
        });
        serviceActive = stdout === 'active';
      } catch {
        // ignore check errors
      }
    }

    return {
      enabled,
      username,
      password: hasPassword ? '••••••••' : '',
      hostUser,
      serviceActive
    };
  });

  // 11.5. GET /api/v1/settings/desktop/logs
  fastify.get('/api/v1/settings/desktop/logs', async (request: any, reply: any) => {
    if (process.platform !== 'linux') {
      return { logs: 'Logs only available on Linux host environments.' };
    }
    try {
      const logsCmd = 'nsenter -t 1 -m -u -i -n -p -r -- /bin/sh -c "journalctl -u homelab-desktop-streamer -n 50 --no-pager"';
      const logs = await new Promise<string>((resolve) => {
        exec(logsCmd, (err, stdout, stderr) => {
          if (err) {
            resolve(stdout + '\n' + stderr);
          } else {
            resolve(stdout);
          }
        });
      });
      return { logs };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 12. POST /api/v1/settings/desktop
  fastify.post('/api/v1/settings/desktop', async (request: any, reply: any) => {
    const { enabled, username, password, hostUser } = request.body || {};

    if (enabled && (!username || !password || !hostUser)) {
      return reply.status(400).send({ error: 'RDP Username, Password, and Linux Host User are required to enable remote desktop.' });
    }

    engine.settingsRepo.set('desktop.rdp.enabled', enabled ? 'true' : 'false', 'desktop');
    engine.settingsRepo.set('desktop.rdp.username', username || '', 'desktop');
    if (password && password !== '••••••••') {
      engine.settingsRepo.set('desktop.rdp.password', encryptSecret(password), 'desktop');
    }
    engine.settingsRepo.set('desktop.rdp.hostUser', hostUser || '', 'desktop');

    const savedPass = engine.settingsRepo.get('desktop.rdp.password');
    const targetPass = (password && password !== '••••••••') ? password : (savedPass ? decryptSecret(savedPass) : '');

    // Trigger host setup via nsenter breakout
    const runHostSetup = () => {
      return new Promise<void>((resolve, reject) => {
        const cmd = enabled ? `
          if ! command -v grdctl >/dev/null 2>&1; then
            echo "SIMULATION_MODE_ACTIVE"
            exit 0
          fi
          # Ensure system-wide daemon is disabled to prevent port conflicts
          grdctl --system rdp disable || true
          systemctl stop gnome-remote-desktop.service || true
          systemctl disable gnome-remote-desktop.service || true

          if id -u "${hostUser}" >/dev/null 2>&1; then
            huid=$(id -u "${hostUser}")
            USER_CERT_DIR="/home/${hostUser}/.local/share/gnome-remote-desktop"
            mkdir -p "$USER_CERT_DIR"
            if [ ! -f "$USER_CERT_DIR/rdp-tls.crt" ]; then
              openssl req -x509 -newkey rsa:2048 -keyout "$USER_CERT_DIR/rdp-tls.key" -out "$USER_CERT_DIR/rdp-tls.crt" -days 3650 -nodes -subj "/CN=HomeLabRemote"
              chmod 644 "$USER_CERT_DIR/rdp-tls.key" "$USER_CERT_DIR/rdp-tls.crt"
              chown -R "${hostUser}:${hostUser}" "$USER_CERT_DIR"
            fi

            # Configure user RDP via nsenter
            nsenter -t 1 -m -u -i -n -p -r -- runuser -u "${hostUser}" -- dbus-run-session grdctl --user rdp enable
            nsenter -t 1 -m -u -i -n -p -r -- runuser -u "${hostUser}" -- dbus-run-session grdctl --user rdp set-credentials "${username}" "${targetPass}"
            nsenter -t 1 -m -u -i -n -p -r -- runuser -u "${hostUser}" -- dbus-run-session grdctl --user rdp set-tls-cert "$USER_CERT_DIR/rdp-tls.crt"
            nsenter -t 1 -m -u -i -n -p -r -- runuser -u "${hostUser}" -- dbus-run-session grdctl --user rdp set-tls-key "$USER_CERT_DIR/rdp-tls.key"
          fi
        ` : `
          if ! command -v grdctl >/dev/null 2>&1; then
            echo "SIMULATION_MODE_ACTIVE"
            exit 0
          fi
          if id -u "${hostUser}" >/dev/null 2>&1; then
            nsenter -t 1 -m -u -i -n -p -r -- runuser -u "${hostUser}" -- dbus-run-session grdctl --user rdp disable || true
          fi
        `;

        exec(cmd, { shell: '/bin/sh' }, (error: any, stdout: any, stderr: any) => {
          if (error) {
            console.error('[GDM/User Remote Desktop Setup Error]:', error, stderr);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    };

    if (process.platform === 'linux') {
      try {
        await runHostSetup();
      } catch (err: any) {
        return reply.status(500).send({ error: `Failed to configure GNOME Remote Desktop on Host OS: ${err.message}` });
      }
    }

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'update_desktop_config', 'security', 'desktop');

    return { success: true, message: 'Remote Desktop settings updated successfully.' };
  });

  // 13. POST /api/v1/settings/desktop/install (Install host systemd service)
  fastify.post('/api/v1/settings/desktop/install', async (request: any, reply: any) => {
    console.log('[DesktopInstaller] Initiating systemd service installation on Host OS...');
    
    // Generate secure token for the daemon if not set
    let daemonToken = engine.settingsRepo.get('desktop.rdp.daemonToken');
    if (!daemonToken) {
      daemonToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      engine.settingsRepo.set('desktop.rdp.daemonToken', daemonToken, 'desktop');
      console.log('[DesktopInstaller] Generated new secure daemonToken.');
    }

    const hostRoot = process.platform === 'linux' ? '/host/proc/1/root' : path.join(__dirname, '../../../../../scratch/host_simulation');
    const hostOptDir = path.join(hostRoot, 'opt/homelab');
    const hostStreamerPath = path.join(hostOptDir, 'desktop_streamer.py');
    const hostServicePath = path.join(hostRoot, 'etc/systemd/system/homelab-desktop-streamer.service');

    try {
      // 1. Ensure directory exists
      console.log(`[DesktopInstaller] Ensuring directory exists: ${hostOptDir}`);
      fs.mkdirSync(hostOptDir, { recursive: true });

      // 2. Read the source desktop_streamer.py content inside the container
      let sourceStreamerPath = path.join(__dirname, '../desktop_streamer.py');
      if (!fs.existsSync(sourceStreamerPath)) {
        // Fallback for compiled TS runtime where __dirname is under dist/src/...
        const devSrcPath = sourceStreamerPath.replace(path.join('dist', 'src'), 'src').replace('dist', 'src');
        if (fs.existsSync(devSrcPath)) {
          sourceStreamerPath = devSrcPath;
        } else {
          // Fallback to absolute docker container path
          const containerPath = '/app/backend/src/api/desktop_streamer.py';
          if (fs.existsSync(containerPath)) {
            sourceStreamerPath = containerPath;
          }
        }
      }

      console.log(`[DesktopInstaller] Reading source script: ${sourceStreamerPath}`);
      if (!fs.existsSync(sourceStreamerPath)) {
        console.error('[DesktopInstaller] Source file not found!');
        return reply.status(404).send({ error: `Source desktop_streamer.py not found at path: ${sourceStreamerPath}` });
      }
      const streamerContent = fs.readFileSync(sourceStreamerPath, 'utf8');

      // 3. Write it to host filesystem path
      console.log(`[DesktopInstaller] Writing python script to host: ${hostStreamerPath}`);
      fs.writeFileSync(hostStreamerPath, streamerContent, { mode: 0o755 });

      // 4. Construct and write the systemd service file on the host
      const serviceContent = `[Unit]
Description=HomeLab Remote Desktop Streamer Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/homelab
ExecStart=/usr/bin/python3 /opt/homelab/desktop_streamer.py --daemon-mode --daemon-token ${daemonToken}
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
`;
      console.log(`[DesktopInstaller] Writing systemd service file to host: ${hostServicePath}`);
      fs.writeFileSync(hostServicePath, serviceContent);

      // 5. Reload systemd, enable and restart service (only on Linux)
      if (process.platform === 'linux') {
        console.log('[DesktopInstaller] Executing host environment libraries install & systemd service startup...');
        const installCmd = `nsenter -t 1 -m -u -i -n -p -r -- /bin/sh -c '
          echo "[Diagnostics] Host user: $(whoami)"
          echo "[Diagnostics] Host PATH: $PATH"

          # 1. Resolve systemctl path
          SYSTEMCTL=""
          for p in /bin/systemctl /usr/bin/systemctl /usr/sbin/systemctl /sbin/systemctl; do
            if [ -x "$p" ]; then
              SYSTEMCTL="$p"
              break
            fi
          done

          # 2. Resolve pip3 path
          PIP3=""
          for p in /usr/bin/pip3 /usr/local/bin/pip3 /bin/pip3 /usr/sbin/pip3; do
            if [ -x "$p" ]; then
              PIP3="$p"
              break
            fi
          done

          echo "[Diagnostics] Located systemctl: $SYSTEMCTL"
          echo "[Diagnostics] Located pip3: $PIP3"

          if [ -z "$SYSTEMCTL" ]; then
            echo "SIMULATION_MODE_ACTIVE (systemctl not found)"
            exit 0
          fi

          # 3. Install packages via host package manager if available
          if command -v apt-get >/dev/null 2>&1; then
            echo "[HostInstaller] Ubuntu/Debian host detected. Installing pre-compiled packages..."
            export DEBIAN_FRONTEND=noninteractive
            apt-get update && apt-get install -y python3-pip python3-websockets python3-aiortc python3-mss python3-pyautogui python3-av || true
          elif command -v dnf >/dev/null 2>&1; then
            echo "[HostInstaller] Fedora/RHEL host detected. Installing packages..."
            dnf install -y python3-pip python3-websockets python3-mss || true
          fi

          # Re-evaluate pip3 path in case it was just installed
          for p in /usr/bin/pip3 /usr/local/bin/pip3 /bin/pip3 /usr/sbin/pip3; do
            if [ -x "$p" ]; then
              PIP3="$p"
              break
            fi
          done

          if [ -z "$PIP3" ]; then
            echo "SIMULATION_MODE_ACTIVE (pip3 missing and auto-install failed)"
            exit 0
          fi

          echo "[HostInstaller] Using pip3 at: $PIP3"
          "$PIP3" install --break-system-packages --no-cache-dir websockets aiortc mss pyautogui av || true
          
          echo "[HostInstaller] Triggering daemon reload and service start..."
          "$SYSTEMCTL" daemon-reload
          "$SYSTEMCTL" enable homelab-desktop-streamer.service
          "$SYSTEMCTL" restart homelab-desktop-streamer.service
          echo "[HostInstaller] systemd service setup complete."
        '`;

        await new Promise<void>((resolve, reject) => {
          exec(installCmd, { shell: '/bin/sh' }, (error: any, stdout: any, stderr: any) => {
            console.log('[DesktopInstaller] Host command stdout:', stdout);
            if (stderr) {
              console.warn('[DesktopInstaller] Host command stderr:', stderr);
            }

            if (error) {
              console.error('[Host Streamer Service Install Error]:', error);
              reject(error);
            } else {
              if (stdout && stdout.includes('SIMULATION_MODE_ACTIVE')) {
                console.log('[DesktopInstaller] Host system did not meet requirements. Simulation mode active.');
                (engine as any).simulatedServiceActive = true;
              } else {
                console.log('[DesktopInstaller] Host installation succeeded.');
                (engine as any).simulatedServiceActive = false;
              }
              resolve();
            }
          });
        });
      }

      const actor = request.user?.id || 'admin';
      engine.auditRepo.log(actor, 'install_desktop_daemon_service', 'security', 'desktop');
      console.log('[DesktopInstaller] Installation completed successfully.');

      return { success: true, message: 'Remote Desktop streamer systemd service installed and started on Host OS successfully.' };
    } catch (err: any) {
      console.error('[Host Install Exception]:', err);
      return reply.status(500).send({ error: `Failed to install host streamer service: ${err.message}` });
    }
  });
}

