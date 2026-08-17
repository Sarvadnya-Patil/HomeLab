import { api } from '../core/api.js';
import { store } from '../core/state.js';

export const AppSettings = {
  container: null,
  activeTab: 'general',
  settingsCache: {},
  plugins: [],
  selectedPluginId: '',
  pluginSchema: [],
  pluginValues: {},
  secStatus: null,

  init(containerEl) {
    this.container = containerEl;
    this.loadSettings();
  },

  async loadSettings() {
    try {
      const list = await api.get('/api/v1/settings');
      this.settingsCache = {};
      list.forEach(item => {
        this.settingsCache[item.key] = {
          value: item.value,
          groupName: item.groupName
        };
      });

      // Fetch 2FA status
      this.secStatus = await api.get('/api/v1/settings/2fa/status').catch(() => null);

      // Prefetch plugins list
      this.plugins = await api.get('/api/v1/plugins').catch(() => []);
      if (this.plugins.length > 0 && !this.selectedPluginId) {
        this.selectedPluginId = this.plugins[0].id;
      }
      
      this.render();
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  render() {
    if (!this.container || store.get('activeApp') !== 'settings') return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: none !important; padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-family: var(--font-mono);">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: 900; text-transform: uppercase;">HomeLab OS Configuration & Security Settings</span>
        <div class="panel-quick-actions" style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button class="btn btn-panel ${this.activeTab === 'general' ? 'btn-open' : ''}" id="tab-settings-general">General</button>
          <button class="btn btn-panel ${this.activeTab === 'account' ? 'btn-open' : ''}" id="tab-settings-account">Account & Password</button>
          <button class="btn btn-panel ${this.activeTab === '2fa' ? 'btn-open' : ''}" id="tab-settings-2fa">2FA & SMTP Security</button>
          <button class="btn btn-panel ${this.activeTab === 'ssh' ? 'btn-open' : ''}" id="tab-settings-ssh">SSH Terminal Config</button>
          <button class="btn btn-panel ${this.activeTab === 'desktop' ? 'btn-open' : ''}" id="tab-settings-desktop">Remote Desktop</button>
          <button class="btn btn-panel ${this.activeTab === 'plugins' ? 'btn-open' : ''}" id="tab-settings-plugins">Plugins Config</button>
          <button class="btn btn-panel ${this.activeTab === 'backup' ? 'btn-open' : ''}" id="tab-settings-backup">Backup Center</button>
        </div>
      </div>
      <div class="settings-form-content" id="settings-tab-form" style="margin-top: 1.5rem; max-width: 580px; display: flex; flex-direction: column; gap: 1rem; font-family: var(--font-mono);">
        <!-- Forms load here -->
      </div>
    `;

    // Bind tab clicks
    this.container.querySelector('#tab-settings-general').addEventListener('click', () => this.switchTab('general'));
    this.container.querySelector('#tab-settings-account').addEventListener('click', () => this.switchTab('account'));
    this.container.querySelector('#tab-settings-2fa').addEventListener('click', () => this.switchTab('2fa'));
    this.container.querySelector('#tab-settings-ssh').addEventListener('click', () => this.switchTab('ssh'));
    this.container.querySelector('#tab-settings-desktop').addEventListener('click', () => this.switchTab('desktop'));
    this.container.querySelector('#tab-settings-plugins').addEventListener('click', () => this.switchTab('plugins'));
    this.container.querySelector('#tab-settings-backup').addEventListener('click', () => this.switchTab('backup'));

    this.renderForm();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  },

  async renderForm() {
    const formEl = this.container.querySelector('#settings-tab-form');
    if (!formEl) return;

    if (this.activeTab === 'general') {
      const appName = this.settingsCache['app.name']?.value || 'HomeLab OS';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.35rem; font-weight: 900; text-transform: uppercase;">App Name Title</label>
          <input type="text" id="set-app-name" value="${appName}" style="background-color: #000000; border: 2px solid #ffffff; border-radius: 0; padding: 0.6rem; color: #ffffff; font-family: var(--font-mono); font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 140px; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Save Settings</button>
      `;
      formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
    } else if (this.activeTab === 'account') {
      formEl.innerHTML = `
        <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; border-radius: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #ffffff; padding-bottom: 0.75rem;">
            <span style="font-weight: 900; text-transform: uppercase; font-size: 0.85rem;">Account Security & Credentials</span>
            <span style="background: #000000; border: 1px solid #ffffff; color: #ffffff; font-weight: 900; padding: 0.2rem 0.6rem; text-transform: uppercase; font-size: 0.68rem;">ROLE: ADMIN</span>
          </div>

          <div style="font-size: 0.72rem; color: #a1a1aa; line-height: 1.4;">
            Update your master administration account password. Password must contain at least 6 characters.
          </div>

          <div class="detail-item">
            <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">Current Password</label>
            <input type="password" id="input-curr-pass" placeholder="Enter current password" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">New Password</label>
              <input type="password" id="input-new-pass" placeholder="Min. 6 characters" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>
            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">Confirm New Password</label>
              <input type="password" id="input-confirm-pass" placeholder="Re-type new password" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>
          </div>

          <div id="account-pass-status" style="display: none; padding: 0.5rem; font-size: 0.72rem; font-weight: 700;"></div>

          <div style="display: flex; gap: 0.6rem; margin-top: 0.5rem;">
            <button class="btn btn-panel btn-open" id="btn-update-password" style="background: #ffffff; border: 2px solid #ffffff; color: #000000; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; padding: 0.55rem 1.2rem; box-shadow: 3px 3px 0 #888888;">UPDATE PASSWORD</button>
          </div>
        </div>
      `;

      formEl.querySelector('#btn-update-password').addEventListener('click', () => this.updateAccountPassword());
    } else if (this.activeTab === '2fa') {
      const status = this.secStatus || { enabled: false, hasPassword: false };
      const isEnabled = status.enabled;
      const statusBadge = isEnabled 
        ? `<span style="background: #000000; border: 1px solid #22c55e; color: #22c55e; font-weight: 900; padding: 0.2rem 0.6rem; text-transform: uppercase; font-size: 0.68rem;">ACTIVE (VERIFIED)</span>`
        : `<span style="background: #000000; border: 1px solid #ef4444; color: #ef4444; font-weight: 900; padding: 0.2rem 0.6rem; text-transform: uppercase; font-size: 0.68rem;">DISABLED / UNVERIFIED</span>`;

      formEl.innerHTML = `
        <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; border-radius: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #ffffff; padding-bottom: 0.75rem;">
            <span style="font-weight: 900; text-transform: uppercase; font-size: 0.85rem;">2FA SMTP Security Status</span>
            ${statusBadge}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SMTP Provider</label>
              <input type="text" id="smtp-provider" value="${status.provider || 'Custom SMTP'}" placeholder="e.g. Gmail, Outlook" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>

            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SMTP Host</label>
              <input type="text" id="smtp-host" value="${status.smtpHost || ''}" placeholder="e.g. smtp.gmail.com" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>

            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SMTP Port</label>
              <input type="number" id="smtp-port" value="${status.smtpPort || 587}" placeholder="587" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>

            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SMTP User / Email (2FA Recipient)</label>
              <input type="email" id="smtp-user" value="${status.smtpUser || ''}" placeholder="user@homelab.org" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">
                SMTP Password ${status.hasPassword ? '<span style="color: #22c55e;">(Encrypted in DB)</span>' : ''}
              </label>
              <input type="password" id="smtp-pass" value="${status.hasPassword ? '••••••••' : ''}" placeholder="Enter SMTP App Password" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>

            <div class="detail-item">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">Sender Name</label>
              <input type="text" id="sender-name" value="${status.senderName || 'HomeLab OS'}" placeholder="HomeLab Security" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            </div>
          </div>

          <div class="detail-item">
            <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">
              Optional Custom 2FA Recipient Email <span style="color: #a1a1aa; font-weight: 400;">(Optional)</span>
            </label>
            <input type="email" id="target-email" value="${status.targetEmail || ''}" placeholder="Leave blank to send to self (SMTP User)" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
            <div style="font-size: 0.65rem; color: #a1a1aa; margin-top: 0.35rem; line-height: 1.4; background: #000000; border: 1px dashed #33333e; padding: 0.5rem;">
              <div>• <b>If left blank</b>: The 2FA OTP code is automatically sent to self (<span style="color: #ffffff;">SMTP User / Email</span>).</div>
              <div>• <b>If filled out</b>: The 2FA OTP code will be delivered to this custom recipient address instead.</div>
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-panel btn-open" id="btn-send-2fa-otp" style="background: #ffffff; border: 2px solid #ffffff; color: #000000; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; padding: 0.55rem 1rem; box-shadow: 3px 3px 0 #888888;">SAVE SMTP & SEND 2FA OTP</button>
            ${isEnabled ? `<button class="btn btn-card-act" id="btn-disable-2fa" style="background: #ef4444; border: 1px solid #ef4444; color: #ffffff; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; padding: 0.55rem 1rem;">DISABLE 2FA</button>` : ''}
          </div>
        </div>

        <!-- Inline OTP Verification Box -->
        <div id="otp-verification-box" style="display: none; background: #000000; border: 2px solid #ffffff; box-shadow: 6px 6px 0 #ffffff; padding: 1.25rem; margin-top: 1rem; border-radius: 0;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #ffffff;">ENTER 6-DIGIT VERIFICATION OTP</h4>
          <p style="font-size: 0.68rem; color: #a1a1aa; margin-bottom: 1rem; line-height: 1.4;">A 6-digit code has been dispatched to your email. Enter the code below to complete strict server-side verification and activate 2FA.</p>
          <input type="text" id="input-2fa-otp" maxlength="6" placeholder="123456" style="font-size: 1.4rem; font-weight: 900; letter-spacing: 8px; text-align: center; background: #0e0e11; border: 2px solid #ffffff; color: #22c55e; padding: 0.6rem; width: 100%; font-family: var(--font-mono); text-transform: uppercase;">
          <button class="btn btn-panel btn-open" id="btn-submit-2fa-otp" style="margin-top: 1rem; width: 100%; background: #ffffff; color: #000000; font-size: 0.78rem; font-weight: 900; text-transform: uppercase; padding: 0.6rem; box-shadow: 3px 3px 0 #888888;">VERIFY & ACTIVATE 2FA</button>
        </div>
      `;

      // Bind 2FA actions
      formEl.querySelector('#btn-send-2fa-otp').addEventListener('click', () => this.send2FAOTP());
      if (isEnabled) {
        formEl.querySelector('#btn-disable-2fa').addEventListener('click', () => this.disable2FA());
      }
    } else if (this.activeTab === 'plugins') {
      if (this.plugins.length === 0) {
        formEl.innerHTML = `<div style="font-size: 0.75rem; color: #a1a1aa;">No service plugins discovered.</div>`;
        return;
      }

      const activePlugin = this.plugins.find(p => p.id === this.selectedPluginId) || this.plugins[0];
      if (!this.selectedPluginId) {
        this.selectedPluginId = activePlugin.id;
      }

      formEl.innerHTML = `
        <div class="detail-item" style="position: relative;">
          <label class="detail-label" style="margin-bottom: 0.35rem; font-weight: 900; text-transform: uppercase;">Select Plugin Target</label>
          <div class="custom-dropdown-container">
            <button class="custom-dropdown-trigger" id="plugin-dropdown-trigger" style="background: #000000; border: 2px solid #ffffff; color: #ffffff; padding: 0.6rem; width: 100%; font-family: var(--font-mono); font-size: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
              <span class="selected-text">${activePlugin.name}</span>
              <span class="dropdown-arrow">▼</span>
            </button>
            <div class="custom-dropdown-menu" id="plugin-dropdown-menu" style="background: #000000; border: 2px solid #ffffff; width: 100%;">
              ${this.plugins.map((p) => `
                <div class="custom-dropdown-item ${p.id === this.selectedPluginId ? 'selected' : ''}" data-value="${p.id}">
                  <span>${p.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div id="dynamic-plugin-form-fields" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-plugin-settings" style="margin-top: 1rem; width: 180px; display: none; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Save Plugin Config</button>
      `;

      const trigger = formEl.querySelector('#plugin-dropdown-trigger');
      const menu = formEl.querySelector('#plugin-dropdown-menu');
      if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.toggle('open');
        });
        menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-value');
            this.selectedPluginId = val;
            menu.classList.remove('open');
            this.render();
          });
        });
      }

      this.loadPluginSchema(this.selectedPluginId);
    } else if (this.activeTab === 'ssh') {
      formEl.innerHTML = `<div style="font-size: 0.75rem; color: #a1a1aa;">Loading SSH configuration...</div>`;
      try {
        const status = await api.get('/api/v1/settings/ssh');
        this.selectedAuthType = status.sshAuthType || 'password';

        formEl.innerHTML = `
          <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; border-radius: 0;">
            <div style="border-bottom: 2px dashed #ffffff; padding-bottom: 0.75rem;">
              <span style="font-weight: 900; text-transform: uppercase; font-size: 0.85rem; color: #ffffff;">SSH Connection Configuration</span>
            </div>

            <div style="display: grid; grid-template-columns: 1.5fr 1fr 0.8fr; gap: 0.85rem;">
              <div class="detail-item">
                <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SSH Host (IP / Domain)</label>
                <input type="text" id="ssh-host" value="${status.sshHost || ''}" placeholder="e.g. local (direct PowerShell), 172.17.0.1" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
              </div>

              <div class="detail-item">
                <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SSH Username</label>
                <input type="text" id="ssh-user" value="${status.sshUser || ''}" placeholder="e.g. root" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
              </div>

              <div class="detail-item">
                <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">SSH Port</label>
                <input type="number" id="ssh-port" value="${status.sshPort || 22}" placeholder="22" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; width: 100%;">
              </div>
            </div>

            <div class="detail-item" style="position: relative;">
              <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; font-size: 0.68rem; text-transform: uppercase;">Authentication Method</label>
              <div class="custom-dropdown-container">
                <button class="custom-dropdown-trigger" id="ssh-dropdown-trigger" style="background: #000000; border: 1px solid #ffffff; color: #ffffff; padding: 0.5rem; width: 100%; font-family: var(--font-mono); font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; border-radius: 0; box-sizing: border-box; height: 31px; outline: none; cursor: pointer;">
                  <span class="selected-text">${this.selectedAuthType === 'privateKey' ? 'SSH Private Key' : 'Password'}</span>
                  <span class="dropdown-arrow" style="font-size: 0.55rem; color: #ffffff;">▼</span>
                </button>
                <div class="custom-dropdown-menu" id="ssh-dropdown-menu" style="background: #000000; border: 1px solid #ffffff; border-radius: 0; width: 100%; margin-top: 4px; box-shadow: 4px 4px 0 #888888;">
                  <div class="custom-dropdown-item ${this.selectedAuthType === 'password' ? 'selected' : ''}" data-value="password" style="font-size: 0.72rem; padding: 0.55rem 0.85rem; border-radius: 0; color: ${this.selectedAuthType === 'password' ? '#000000' : '#ffffff'}; background: ${this.selectedAuthType === 'password' ? '#ffffff' : '#000000'}; transition: none;">
                    <span>Password</span>
                  </div>
                  <div class="custom-dropdown-item ${this.selectedAuthType === 'privateKey' ? 'selected' : ''}" data-value="privateKey" style="font-size: 0.72rem; padding: 0.55rem 0.85rem; border-radius: 0; color: ${this.selectedAuthType === 'privateKey' ? '#000000' : '#ffffff'}; background: ${this.selectedAuthType === 'privateKey' ? '#ffffff' : '#000000'}; transition: none;">
                    <span>SSH Private Key</span>
                  </div>
                </div>
              </div>
            </div>

            <button class="btn btn-panel btn-open" id="btn-save-ssh" style="margin-top: 0.5rem; width: 160px; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Save SSH Config</button>
          </div>
        `;

        // Toggle custom dropdown list visibility
        const trigger = formEl.querySelector('#ssh-dropdown-trigger');
        const menu = formEl.querySelector('#ssh-dropdown-menu');
        
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.toggle('open');
        });

        document.addEventListener('click', () => {
          menu.classList.remove('open');
        });

        menu.querySelectorAll('.custom-dropdown-item').forEach(item => {
          item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('selected')) {
              item.style.background = '#ffffff';
              item.style.color = '#000000';
            }
          });
          item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('selected')) {
              item.style.background = '#000000';
              item.style.color = '#ffffff';
            }
          });

          item.addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-value');
            this.selectedAuthType = val;
            menu.classList.remove('open');
            trigger.querySelector('.selected-text').textContent = val === 'privateKey' ? 'SSH Private Key' : 'Password';
            
            menu.querySelectorAll('.custom-dropdown-item').forEach(i => {
              i.classList.remove('selected');
              i.style.background = '#000000';
              i.style.color = '#ffffff';
            });
            e.currentTarget.classList.add('selected');
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#000000';
          });
        });

        formEl.querySelector('#btn-save-ssh').addEventListener('click', () => this.saveSSHConfig());
      } catch (err) {
        formEl.innerHTML = `<div style="font-size: 0.75rem; color: #ef4444;">Failed to load SSH configuration: ${err.message}</div>`;
      }
    } else if (this.activeTab === 'desktop') {
      try {
        const config = await api.get('/api/v1/settings/desktop');
        const statusBadge = config.serviceActive
          ? `<span id="daemon-status-badge" style="background: #000000; border: 1px solid #22c55e; color: #22c55e; font-weight: 900; padding: 0.2rem 0.6rem; text-transform: uppercase; font-size: 0.68rem;">DAEMON ACTIVE (SYSTEMD)</span>`
          : `<span id="daemon-status-badge" style="background: #000000; border: 1px solid #ef4444; color: #ef4444; font-weight: 900; padding: 0.2rem 0.6rem; text-transform: uppercase; font-size: 0.68rem;">NOT INSTALLED / INACTIVE</span>`;

        formEl.innerHTML = `
          <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; border-radius: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #ffffff; padding-bottom: 0.75rem;">
              <div>
                <span style="font-weight: 900; text-transform: uppercase; font-size: 0.85rem; color: #ffffff;">Direct GPU Kernel Remote Desktop</span>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.68rem; color: #a1a1aa;">Hardware-accelerated Linux kernel DRM/KMS scanout streamer with native /dev/uinput input driver.</p>
              </div>
              ${statusBadge}
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button class="btn btn-panel btn-open" id="btn-install-desktop-daemon" style="flex: 1; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Install / Update Host Daemon</button>
            </div>

            <div style="margin-top: 1rem;" id="daemon-logs-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="margin: 0; font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em;">Host Service Logs (journalctl -u homelab-desktop-streamer)</h4>
                <button id="btn-refresh-daemon-logs" class="btn" style="background: none; border: 1px solid #ffffff; color: #ffffff; font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; text-transform: uppercase; padding: 0.2rem 0.6rem; font-weight: bold; box-shadow: 2px 2px 0 #888888;">Refresh Logs</button>
              </div>
              <pre id="daemon-logs-pre" style="background: #09090b; border: 1.5px solid #27272a; padding: 0.75rem; font-size: 0.6rem; max-height: 200px; overflow-y: auto; color: #a1a1aa; margin: 0; line-height: 1.4; white-space: pre-wrap; font-family: var(--font-mono); text-align: left;"></pre>
            </div>
          </div>
        `;

        formEl.querySelector('#btn-install-desktop-daemon').addEventListener('click', () => this.installDesktopDaemon());
        const refreshLogsBtn = formEl.querySelector('#btn-refresh-daemon-logs');
        if (refreshLogsBtn) {
          refreshLogsBtn.addEventListener('click', () => this.fetchDaemonLogs());
        }
        
        // Fetch logs on render
        this.fetchDaemonLogs();
      } catch (err) {
        formEl.innerHTML = `<div style="font-size: 0.75rem; color: #ef4444;">Failed to load Remote Desktop settings: ${err.message}</div>`;
      }
    } else if (this.activeTab === 'backup') {
      formEl.innerHTML = `
        <div style="background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; border-radius: 0;">
          <h4 style="margin: 0; font-weight: 900; text-transform: uppercase; font-size: 0.85rem; color: #ffffff;">Database & Configuration Backup Center</h4>
          <p style="font-size: 0.7rem; color: #a1a1aa; margin: 0; line-height: 1.4;">Create a complete SQL archive snapshot of your workspaces, categories, widgets, encrypted settings, and custom overrides.</p>
          <button class="btn btn-panel btn-open" id="btn-trigger-backup" style="margin-top: 0.5rem; width: 160px; background: #ffffff; color: #000000; border: 2px solid #ffffff; font-weight: 900; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">Run Backup</button>
        </div>
      `;
      formEl.querySelector('#btn-trigger-backup').addEventListener('click', () => this.runBackup());
    }
  },

  async saveSMTPConfig(silent = false) {
    const provider = this.container.querySelector('#smtp-provider')?.value.trim();
    const smtpHost = this.container.querySelector('#smtp-host')?.value.trim();
    const smtpPort = this.container.querySelector('#smtp-port')?.value.trim();
    const smtpUser = this.container.querySelector('#smtp-user')?.value.trim();
    const smtpPass = this.container.querySelector('#smtp-pass')?.value.trim();
    const senderEmail = this.container.querySelector('#sender-email')?.value?.trim() || smtpUser;
    const senderName = this.container.querySelector('#sender-name')?.value.trim();
    const targetEmail = this.container.querySelector('#target-email')?.value.trim();

    try {
      const res = await api.post('/api/v1/settings/smtp', {
        provider,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPass,
        senderEmail,
        senderName,
        targetEmail
      });
      // Silent mode: skip alert + DOM re-render so the OTP box is not destroyed
      if (!silent) {
        alert(res.message || 'SMTP Settings saved successfully with encrypted password!');
        this.loadSettings();
      }
    } catch (err) {
      alert(`Failed to save SMTP configuration: ${err.message}`);
      throw err; // Re-throw so callers like send2FAOTP can abort on failure
    }
  },

  async updateAccountPassword() {
    const currPass = this.container.querySelector('#input-curr-pass')?.value;
    const newPass = this.container.querySelector('#input-new-pass')?.value;
    const confirmPass = this.container.querySelector('#input-confirm-pass')?.value;
    const statusEl = this.container.querySelector('#account-pass-status');

    if (!statusEl) return;

    if (!currPass || !newPass) {
      statusEl.style.display = 'block';
      statusEl.style.background = '#000000';
      statusEl.style.border = '1px solid #ef4444';
      statusEl.style.color = '#ef4444';
      statusEl.textContent = 'Both current password and new password are required.';
      return;
    }

    if (newPass.length < 6) {
      statusEl.style.display = 'block';
      statusEl.style.background = '#000000';
      statusEl.style.border = '1px solid #ef4444';
      statusEl.style.color = '#ef4444';
      statusEl.textContent = 'New password must be at least 6 characters long.';
      return;
    }

    if (newPass !== confirmPass) {
      statusEl.style.display = 'block';
      statusEl.style.background = '#000000';
      statusEl.style.border = '1px solid #ef4444';
      statusEl.style.color = '#ef4444';
      statusEl.textContent = 'New password and confirmation do not match.';
      return;
    }

    try {
      const res = await api.put('/api/v1/auth/password', {
        currentPassword: currPass,
        newPassword: newPass
      });

      statusEl.style.display = 'block';
      statusEl.style.background = '#000000';
      statusEl.style.border = '1px solid #22c55e';
      statusEl.style.color = '#22c55e';
      statusEl.textContent = res.message || 'Password updated successfully!';

      // Clear inputs
      const currEl = this.container.querySelector('#input-curr-pass');
      const newEl = this.container.querySelector('#input-new-pass');
      const confEl = this.container.querySelector('#input-confirm-pass');
      if (currEl) currEl.value = '';
      if (newEl) newEl.value = '';
      if (confEl) confEl.value = '';
    } catch (err) {
      statusEl.style.display = 'block';
      statusEl.style.background = '#000000';
      statusEl.style.border = '1px solid #ef4444';
      statusEl.style.color = '#ef4444';
      statusEl.textContent = `Failed to update password: ${err.message || 'Incorrect current password'}`;
    }
  },

  async saveSSHConfig() {
    const sshHost = this.container.querySelector('#ssh-host')?.value.trim();
    const sshPort = this.container.querySelector('#ssh-port')?.value.trim();
    const sshUser = this.container.querySelector('#ssh-user')?.value.trim();
    const sshAuthType = this.selectedAuthType || 'password';

    if (!sshHost) {
      alert('SSH Host IP/Domain is required.');
      return;
    }

    try {
      const res = await api.post('/api/v1/settings/ssh', {
        sshHost,
        sshPort,
        sshUser,
        sshAuthType
      });
      alert(res.message || 'SSH Settings saved successfully!');
      this.loadSettings();
    } catch (err) {
      alert(`Failed to save SSH configuration: ${err.message}`);
    }
  },

  async send2FAOTP() {
    const targetEmail = this.container.querySelector('#target-email')?.value.trim() || this.container.querySelector('#smtp-user')?.value.trim();
    if (!targetEmail) {
      alert('Please enter a recipient email address for 2FA OTP verification.');
      return;
    }

    const btn = this.container.querySelector('#btn-send-2fa-otp');
    if (btn) {
      btn.textContent = 'SAVING & DISPATCHING OTP...';
      btn.disabled = true;
    }

    try {
      // Save SMTP silently — do NOT call loadSettings() which would destroy the OTP box
      await this.saveSMTPConfig(true);

      // Dispatch the OTP email
      const res = await api.post('/api/v1/settings/2fa/send-otp', { targetEmail });

      // Only reveal OTP box AFTER successful email dispatch
      const otpBox = this.container.querySelector('#otp-verification-box');
      if (otpBox) {
        otpBox.style.display = 'block';
        otpBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const submitBtn = otpBox.querySelector('#btn-submit-2fa-otp');
        if (submitBtn) submitBtn.onclick = () => this.submit2FAOTP(targetEmail);
        const otpInput = otpBox.querySelector('#input-2fa-otp');
        if (otpInput) setTimeout(() => otpInput.focus(), 300);
      }

      alert(res.message || `OTP dispatched to ${targetEmail}. Check your inbox and enter the 6-digit code below.`);
    } catch (err) {
      alert(`OTP Dispatch Failed: ${err.message}`);
    } finally {
      if (btn) {
        btn.textContent = 'SAVE SMTP & SEND 2FA OTP';
        btn.disabled = false;
      }
    }
  },

  async submit2FAOTP(targetEmail) {
    const otpInput = this.container.querySelector('#input-2fa-otp');
    const otp = otpInput?.value.trim();
    if (!otp || otp.length !== 6) {
      alert('Please enter the full 6-digit OTP code sent to your email.');
      return;
    }

    try {
      const res = await api.post('/api/v1/settings/2fa/verify-otp', { targetEmail, otp });
      alert(res.message || '2FA Successfully Verified & Activated!');
      this.loadSettings();
    } catch (err) {
      alert(`Verification Failed: ${err.message}`);
    }
  },

  async disable2FA() {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication?')) return;
    try {
      await api.post('/api/v1/settings/2fa/disable', {});
      alert('2FA has been disabled.');
      this.loadSettings();
    } catch (err) {
      alert(`Failed to disable 2FA: ${err.message}`);
    }
  },

  async loadPluginSchema(pluginId) {
    const fieldsContainer = this.container.querySelector('#dynamic-plugin-form-fields');
    const saveBtn = this.container.querySelector('#btn-save-plugin-settings');
    if (!fieldsContainer || !saveBtn) return;

    try {
      const manifest = await api.get(`/api/v1/plugins/${pluginId}`);
      this.pluginSchema = manifest.configSchema || [];
      this.pluginValues = await api.get(`/api/v1/plugins/${pluginId}/settings`).catch(() => ({}));

      if (this.pluginSchema.length === 0) {
        fieldsContainer.innerHTML = `<span style="color: #a1a1aa; font-size: 0.75rem;">No configurable options for this plugin.</span>`;
        saveBtn.style.display = 'none';
        return;
      }

      let html = '';
      this.pluginSchema.forEach(field => {
        const val = this.pluginValues[field.key] !== undefined ? this.pluginValues[field.key] : (field.default || '');
        html += `
          <div class="detail-item">
            <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: 800; text-transform: uppercase; font-size: 0.68rem;">${field.label}</label>
            ${field.type === 'toggle' ? `
              <input type="checkbox" id="field-${field.key}" ${val ? 'checked' : ''} style="margin-top: 0.25rem;">
            ` : `
              <input type="${field.type === 'password' ? 'password' : 'text'}" id="field-${field.key}" value="${val}" style="background-color: #000000; border: 1px solid #ffffff; padding: 0.5rem; color: #ffffff; font-family: var(--font-mono); font-size: 0.75rem; width: 100%;">
            `}
          </div>
        `;
      });

      fieldsContainer.innerHTML = html;
      saveBtn.style.display = 'block';
      saveBtn.onclick = () => this.savePluginSettingsValues();
    } catch (err) {
      fieldsContainer.innerHTML = `<span style="color: #ef4444; font-size: 0.75rem;">Failed to render: ${err.message}</span>`;
    }
  },

  async savePluginSettingsValues() {
    const payload = {};
    this.pluginSchema.forEach(field => {
      const el = this.container.querySelector(`#field-${field.key}`);
      if (el) {
        if (field.type === 'toggle') {
          payload[field.key] = el.checked;
        } else {
          payload[field.key] = el.value;
        }
      }
    });

    try {
      await api.put(`/api/v1/plugins/${this.selectedPluginId}/settings`, payload);
      alert('Plugin configuration parameters saved successfully.');
      this.loadSettings();
    } catch (err) {
      alert(`Failed to save plugin configuration: ${err.message}`);
    }
  },

  async saveFormValues() {
    const payload = {};
    if (this.activeTab === 'general') {
      const name = this.container.querySelector('#set-app-name').value.trim();
      payload['app.name'] = { value: name, groupName: 'general' };
    }

    try {
      await api.put('/api/v1/settings', payload);
      alert('Settings saved successfully. Refreshing Cache...');
      this.loadSettings();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  },



  async runBackup() {
    const btn = this.container.querySelector('#btn-trigger-backup');
    btn.textContent = 'BACKING UP...';
    btn.disabled = true;

    try {
      await api.post('/api/v1/terminal', { command: 'run-backup' });
      alert('HomeLab OS database backup archive created successfully.');
    } catch (err) {
      alert(`Backup failed: ${err.message}`);
    } finally {
      btn.textContent = 'RUN BACKUP';
      btn.disabled = false;
    }
  },



  async installDesktopDaemon() {
    const btn = this.container.querySelector('#btn-install-desktop-daemon');
    const badge = this.container.querySelector('#daemon-status-badge');
    if (btn) {
      btn.textContent = 'INSTALLING SERVICE...';
      btn.disabled = true;
    }
    if (badge) {
      badge.textContent = 'INSTALLING HOST PACKAGES...';
      badge.style.background = '#eab308';
      badge.style.color = '#000000';
    }

    try {
      const res = await api.post('/api/v1/settings/desktop/install');
      if (badge) {
        badge.textContent = 'DAEMON ACTIVE (RUNNING)';
        badge.style.background = '#22c55e';
        badge.style.color = '#000000';
      }
      this.loadSettings();
      const apps = await api.get('/api/v1/apps');
      store.set('apps', apps);

      // Auto-poll service state for 5 seconds to guarantee badge sync
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const cfg = await api.get('/api/v1/settings/desktop');
          if (cfg.serviceActive && badge) {
            badge.textContent = 'DAEMON ACTIVE (RUNNING)';
            badge.style.background = '#22c55e';
            badge.style.color = '#000000';
            clearInterval(pollInterval);
          }
        } catch {
          // ignore
        }
        if (attempts > 5) clearInterval(pollInterval);
      }, 1200);
    } catch (err) {
      if (badge) {
        badge.textContent = 'INSTALLATION FAILED';
        badge.style.background = '#ef4444';
        badge.style.color = '#ffffff';
      }
      alert(`Installation error: ${err.message}`);
    } finally {
      if (btn) {
        btn.textContent = 'INSTALL HOST DAEMON';
        btn.disabled = false;
      }
      this.fetchDaemonLogs();
    }
  },

  async fetchDaemonLogs() {
    const logsSection = this.container?.querySelector('#daemon-logs-section');
    const logsPre = this.container?.querySelector('#daemon-logs-pre');
    const refreshBtn = this.container?.querySelector('#btn-refresh-daemon-logs');
    if (!logsSection || !logsPre) return;

    // Bind refresh button click once
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "true";
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.fetchDaemonLogs();
      });
    }

    try {
      logsPre.textContent = 'Fetching logs from host...';
      logsSection.style.display = 'block';
      const res = await api.get('/api/v1/settings/desktop/logs');
      logsPre.textContent = res.logs || 'No logs returned from host.';
      // Colorize red errors for high contrast readability
      if (res.logs && (res.logs.includes('error') || res.logs.includes('fail') || res.logs.includes('Exception'))) {
        logsPre.style.color = '#f87171'; // soft red
      } else {
        logsPre.style.color = '#34d399'; // green success/ok
      }
    } catch (err) {
      logsPre.textContent = 'Failed to fetch logs: ' + err.message;
      logsPre.style.color = '#ef4444';
    }
  }
};

export default AppSettings;
