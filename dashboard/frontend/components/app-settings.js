// Settings Application - Preferences & Dynamic Plugin Configurator
import { api } from '../core/api.js';

export const AppSettings = {
  container: null,
  activeTab: 'general',
  settingsCache: {},
  plugins: [],
  selectedPluginId: '',
  pluginSchema: [],
  pluginValues: {},

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
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">HomeLab OS Configuration Settings</span>
        <div class="panel-quick-actions" style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button class="btn btn-panel ${this.activeTab === 'general' ? 'btn-open' : ''}" id="tab-settings-general">General</button>
          <button class="btn btn-panel ${this.activeTab === 'appearance' ? 'btn-open' : ''}" id="tab-settings-appearance">Appearance</button>
          <button class="btn btn-panel ${this.activeTab === 'docker' ? 'btn-open' : ''}" id="tab-settings-docker">Docker Proxy</button>
          <button class="btn btn-panel ${this.activeTab === 'metrics' ? 'btn-open' : ''}" id="tab-settings-metrics">Metrics Scraper</button>
          <button class="btn btn-panel ${this.activeTab === 'plugins' ? 'btn-open' : ''}" id="tab-settings-plugins">Plugins Config</button>
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
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">App Name Title</label>
          <input type="text" id="set-app-name" value="${appName}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
      formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
    } else if (this.activeTab === 'appearance') {
      const width = this.settingsCache['ui.sidebar_width']?.value || '220';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Sidebar Width (px)</label>
          <input type="number" id="set-sidebar-width" value="${width}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
      formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
    } else if (this.activeTab === 'docker') {
      const proxy = this.settingsCache['docker.proxy_url']?.value || 'http://docker-proxy:2375';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Docker Socket Proxy TCP Endpoint</label>
          <input type="text" id="set-docker-proxy" value="${proxy}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: var(--font-mono); font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
      formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
    } else if (this.activeTab === 'metrics') {
      const interval = this.settingsCache['metrics.interval']?.value || '3000';
      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Hardware Metrics Scraping Interval (ms)</label>
          <input type="number" id="set-metrics-interval" value="${interval}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-settings" style="margin-top: 1rem; width: 100px;">Save Settings</button>
      `;
      formEl.querySelector('#btn-save-settings').addEventListener('click', () => this.saveFormValues());
    } else if (this.activeTab === 'plugins') {
      if (this.plugins.length === 0) {
        formEl.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted);">No service plugins discovered.</div>`;
        return;
      }

      let options = '';
      this.plugins.forEach(p => {
        options += `<option value="${p.id}" ${p.id === this.selectedPluginId ? 'selected' : ''}>${p.name}</option>`;
      });

      formEl.innerHTML = `
        <div class="detail-item">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Select Plugin Target</label>
          <select id="select-settings-plugin" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-size: 0.75rem; width: 100%;">
            ${options}
          </select>
        </div>
        <div id="dynamic-plugin-form-fields" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
          <!-- Dynamically generated fields go here -->
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-plugin-settings" style="margin-top: 1rem; width: 150px; display: none;">Save Plugin Config</button>
      `;

      const select = formEl.querySelector('#select-settings-plugin');
      select.addEventListener('change', () => {
        this.selectedPluginId = select.value;
        this.loadPluginSettingsSchema();
      });

      this.loadPluginSettingsSchema();
    } else if (this.activeTab === 'backup') {
      formEl.innerHTML = `
        <div class="detail-item" style="border: 1px dashed var(--border-slate); border-radius: 6px; padding: 1rem;">
          <h4 style="font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem;">Database Backup Staging Center</h4>
          <p style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 1rem;">
            Executes transactional copies of the SQLite configurations. Backups staging archives are saved to logs/backups/ directories.
          </p>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-panel" id="btn-trigger-backup">Run Backup</button>
          </div>
        </div>
      `;
      formEl.querySelector('#btn-trigger-backup').addEventListener('click', () => this.runBackup());
    }
  },

  async loadPluginSettingsSchema() {
    const fieldsContainer = this.container.querySelector('#dynamic-plugin-form-fields');
    const saveBtn = this.container.querySelector('#btn-save-plugin-settings');
    if (!fieldsContainer || !this.selectedPluginId) return;

    fieldsContainer.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">Fetching plugin settings schema...</span>';
    saveBtn.style.display = 'none';

    try {
      const res = await api.get(`/api/v1/plugins/${this.selectedPluginId}/settings`);
      this.pluginSchema = res.schema || [];
      this.pluginValues = res.values || {};

      if (this.pluginSchema.length === 0) {
        fieldsContainer.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">This plugin does not declare any settings parameters in its manifest.</span>`;
        return;
      }

      let html = '';
      this.pluginSchema.forEach(field => {
        const val = this.pluginValues[field.key] !== undefined ? this.pluginValues[field.key] : (field.default || '');
        
        let inputMarkup = '';
        if (field.type === 'toggle') {
          const checked = val === 'true' || val === true ? 'checked' : '';
          inputMarkup = `
            <input type="checkbox" id="field-${field.key}" ${checked} style="width: auto;">
            <span style="font-size: 0.65rem; color: var(--text-secondary); margin-left: 0.5rem;">${field.description || ''}</span>
          `;
        } else if (field.type === 'select') {
          let opts = '';
          (field.options || []).forEach(o => {
            opts += `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`;
          });
          inputMarkup = `
            <select id="field-${field.key}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.4rem; color: var(--text-primary); font-size: 0.75rem; width: 100%;">
              ${opts}
            </select>
            <span style="font-size: 0.6rem; color: var(--text-muted); display: block; margin-top: 0.2rem;">${field.description || ''}</span>
          `;
        } else {
          // fallback to text / number / password
          const inputType = field.type === 'password' ? 'password' : (field.type === 'number' ? 'number' : 'text');
          inputMarkup = `
            <input type="${inputType}" id="field-${field.key}" value="${val}" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.4rem; color: var(--text-primary); font-family: inherit; font-size: 0.75rem; width: 100%;">
            <span style="font-size: 0.6rem; color: var(--text-muted); display: block; margin-top: 0.2rem;">${field.description || ''}</span>
          `;
        }

        html += `
          <div class="plugin-setting-field" style="display: flex; flex-direction: column; gap: 0.25rem;">
            <label style="font-size: 0.7rem; font-weight: 600; color: #fff;">${field.label}</label>
            <div style="display: flex; align-items: center;">
              ${inputMarkup}
            </div>
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
      await api.post('/api/v1/terminal', { command: 'run-backup' });
      alert('HomeLab OS database backup archive created successfully.');
    } catch (err) {
      alert(`Backup failed: ${err.message}`);
    } finally {
      btn.textContent = 'Run Backup';
      btn.disabled = false;
    }
  }
};
export default AppSettings;
