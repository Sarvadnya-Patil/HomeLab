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
    } else if (this.activeTab === 'plugins') {
      if (this.plugins.length === 0) {
        formEl.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted);">No service plugins discovered.</div>`;
        return;
      }

      const activePlugin = this.plugins.find(p => p.id === this.selectedPluginId) || this.plugins[0];
      if (!this.selectedPluginId) {
        this.selectedPluginId = activePlugin.id;
      }

      formEl.innerHTML = `
        <div class="detail-item" style="position: relative;">
          <label class="detail-label" style="margin-bottom: 0.25rem; font-weight: bold;">Select Plugin Target</label>
          <div class="custom-dropdown-container">
            <button class="custom-dropdown-trigger" id="plugin-dropdown-trigger">
              <span class="selected-text">${activePlugin.name}</span>
              <span class="dropdown-arrow">▼</span>
            </button>
            <div class="custom-dropdown-menu" id="plugin-dropdown-menu">
              ${this.plugins.map((p) => `
                <div class="custom-dropdown-item ${p.id === this.selectedPluginId ? 'selected' : ''}" data-value="${p.id}">
                  <span>${p.name}</span>
                  ${p.id === this.selectedPluginId ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div id="dynamic-plugin-form-fields" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;">
          <!-- Dynamically generated fields go here -->
        </div>
        <button class="btn btn-panel btn-open" id="btn-save-plugin-settings" style="margin-top: 1rem; width: 150px; display: none;">Save Plugin Config</button>
      `;

      const trigger = formEl.querySelector('#plugin-dropdown-trigger');
      const menu = formEl.querySelector('#plugin-dropdown-menu');
      const selectedTextSpan = trigger.querySelector('.selected-text');
      const items = formEl.querySelectorAll('.custom-dropdown-item');

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.style.display === 'block';
        if (isOpen) {
          menu.style.display = 'none';
          trigger.classList.remove('active');
        } else {
          menu.style.display = 'block';
          trigger.classList.add('active');
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        menu.style.display = 'none';
        trigger.classList.remove('active');
      });

      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.getAttribute('data-value');
          const name = item.querySelector('span').textContent;
          this.selectedPluginId = val;
          selectedTextSpan.textContent = name;

          items.forEach(el => {
            el.classList.remove('selected');
            const svg = el.querySelector('svg');
            if (svg) svg.remove();
          });

          item.classList.add('selected');
          const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          checkSvg.setAttribute('viewBox', '0 0 24 24');
          checkSvg.setAttribute('fill', 'none');
          checkSvg.setAttribute('stroke', 'currentColor');
          checkSvg.setAttribute('stroke-width', '2.5');
          checkSvg.setAttribute('stroke-linecap', 'round');
          checkSvg.setAttribute('stroke-linejoin', 'round');
          checkSvg.style.width = '14px';
          checkSvg.style.height = '14px';
          checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
          item.appendChild(checkSvg);

          menu.style.display = 'none';
          trigger.classList.remove('active');

          this.loadPluginSettingsSchema();
        });
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
