// Settings Application - Preferences configuration panel
import { api } from '../core/api.js';

export const AppSettings = {
  container: null,
  activeTab: 'general',
  settingsCache: {},

  init(containerEl) {
    this.container = containerEl;
    this.loadSettings();
  },

  async loadSettings() {
    try {
      const list = await api.get('/api/v1/settings');
      // Format as records map
      this.settingsCache = {};
      list.forEach(item => {
        this.settingsCache[item.key] = {
          value: item.value,
          groupName: item.groupName
        };
      });
      this.render();
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">HomeLab OS Configuration Settings</span>
        <div class="panel-quick-actions" style="display: flex; gap: 0.4rem;">
          <button class="btn btn-panel ${this.activeTab === 'general' ? 'btn-open' : ''}" id="tab-settings-general">General</button>
          <button class="btn btn-panel ${this.activeTab === 'appearance' ? 'btn-open' : ''}" id="tab-settings-appearance">Appearance</button>
          <button class="btn btn-panel ${this.activeTab === 'docker' ? 'btn-open' : ''}" id="tab-settings-docker">Docker Proxy</button>
          <button class="btn btn-panel ${this.activeTab === 'metrics' ? 'btn-open' : ''}" id="tab-settings-metrics">Metrics Scraper</button>
          <button class="btn btn-panel ${this.activeTab === 'backup' ? 'btn-open' : ''}" id="tab-settings-backup">Backup Center</button>
        </div>
      </div>
      <div class="settings-form-content" id="settings-tab-form" style="margin-top: 1.5rem; max-width: 500px; display: flex; flex-direction: column; gap: 1rem;">
        <!-- Forms load here -->
      </div>
    `;

    // Bind tab clicks
    this.container.querySelector('#tab-settings-general').addEventListener('click', () => this.switchTab('general'));
    this.container.querySelector('#tab-settings-appearance').addEventListener('click', () => this.switchTab('appearance'));
    this.container.querySelector('#tab-settings-docker').addEventListener('click', () => this.switchTab('docker'));
    this.container.querySelector('#tab-settings-metrics').addEventListener('click', () => this.switchTab('metrics'));
    this.container.querySelector('#tab-settings-backup').addEventListener('click', () => this.switchTab('backup'));

    this.renderForm();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  },

  renderForm() {
    const formEl = this.container.querySelector('#settings-tab-form');
    if (!formEl) return;

    if (this.activeTab === 'general') {
      const appName = this.settingsCache['app.name']?.value || 'HomeLab OS';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">App Name Title</label>
          <input type="text" id="set-app-name" value="${appName}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
    } else if (this.activeTab === 'appearance') {
      const width = this.settingsCache['ui.sidebar_width']?.value || '220';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Sidebar Width (px)</label>
          <input type="number" id="set-sidebar-width" value="${width}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
    } else if (this.activeTab === 'docker') {
      const proxy = this.settingsCache['docker.proxy_url']?.value || 'http://docker-proxy:2375';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Docker Socket Proxy TCP Endpoint</label>
          <input type="text" id="set-docker-proxy" value="${proxy}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: var(--font-mono); font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
    } else if (this.activeTab === 'metrics') {
      const interval = this.settingsCache['metrics.interval']?.value || '3000';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Hardware Metrics Scraping Interval (ms)</label>
          <input type="number" id="set-metrics-interval" value="${interval}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
    } else if (this.activeTab === 'backup') {
      formEl.innerHTML = `
        <div class="detail-item" style="border: 1px dashed var(--border-slate); border-radius: 6px; padding: 1rem;">
          <h4 style="font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem;">Database Backup Staging Center</h4>
          <p style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 1rem;">
            Executes transactional copies of the SQLite configurations. Backups staging archives are saved to logs/backups/ directories.
          </p>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-panel" id="btn-trigger-backup">Run Backup</button>
            <button class="btn btn-panel" id="btn-trigger-restore" style="display: none;">Restore Backup</button>
          </div>
        </div>
      `;

      formEl.querySelector('#btn-trigger-backup').addEventListener('click', () => this.runBackup());
      return;
    }

    formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
  },

  async saveFormValues() {
    const payload = {};
    if (this.activeTab === 'general') {
      const name = this.container.querySelector('#set-app-name').value.trim();
      payload['app.name'] = { value: name, groupName: 'general' };
    } else if (this.activeTab === 'appearance') {
      const width = this.container.querySelector('#set-sidebar-width').value.trim();
      payload['ui.sidebar_width'] = { value: width, groupName: 'appearance' };
    } else if (this.activeTab === 'docker') {
      const proxy = this.container.querySelector('#set-docker-proxy').value.trim();
      payload['docker.proxy_url'] = { value: proxy, groupName: 'docker' };
    } else if (this.activeTab === 'metrics') {
      const interval = this.container.querySelector('#set-metrics-interval').value.trim();
      payload['metrics.interval'] = { value: interval, groupName: 'metrics' };
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
    btn.textContent = 'Backing up...';
    btn.disabled = true;

    try {
      // Execute local shell mock/backup trigger endpoint on backend
      await api.post('/api/v1/terminal', { command: 'run-backup' });
      alert('HomeLab OS database backup archive created successfully under backups/ staging path.');
    } catch (err) {
      alert(`Backup failed: ${err.message}`);
    } finally {
      btn.textContent = 'Run Backup';
      btn.disabled = false;
    }
  }
};

export default AppSettings;
