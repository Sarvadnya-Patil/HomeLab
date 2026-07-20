// System Subsystems Health Check Dashboard Component
import { store } from '../core/state.js';
import { getIcon } from '../utils/icons.js';

export const AppHealth = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();

    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      this.onSearchInput = () => {
        const currentHealth = store.get('healthStatus');
        if (currentHealth) {
          this.updateUI(currentHealth);
        }
      };
      mainSearchBar.addEventListener('input', this.onSearchInput);
    }

    // Listen to unified health status updates
    store.on('healthStatus', ({ value }) => this.updateUI(value));
    store.on('metrics', () => this.updateMetricsUI());

    // Initial render if data is already loaded
    const currentHealth = store.get('healthStatus');
    if (currentHealth) {
      this.updateUI(currentHealth);
    }
    const currentMetrics = store.get('metrics');
    if (currentMetrics) {
      this.updateMetricsUI(currentMetrics);
    }
    window.activeAppDestroy = () => this.destroy();
  },

  destroy() {
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar && this.onSearchInput) {
      mainSearchBar.removeEventListener('input', this.onSearchInput);
    }
  },

  async render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="health-layout" style="display: flex; flex-direction: column; gap: 1.25rem; color: #ffffff; height: 100%; font-family: var(--font-mono);">
        <div>
          <h2 style="margin: 0; font-size: 1rem; color: #ffffff; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;">SYSTEM SUBSYSTEMS HEALTH MATRIX</h2>
          <span style="font-size: 0.68rem; color: #a1a1aa; font-family: var(--font-mono);">Real-time metrics, response latency, and heartbeats</span>
        </div>

        <div id="health-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; width: 100%;">
          <div class="circular-loader-overlay" style="grid-column: 1 / -1;">
            <div class="circular-spinner"></div>
            <span class="circular-loader-text">RUNNING HEALTH & SUBSYSTEM DIAGNOSTICS...</span>
          </div>
        </div>

        <div style="margin-top: 1rem; border-top: 2px dashed #ffffff; padding-top: 1.25rem;">
          <h3 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: #ffffff; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;">System Information Overview</h3>
          <div id="system-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
          </div>
        </div>
      </div>
    `;
  },

  updateUI(healthData) {
    const grid = this.container?.querySelector('#health-grid');
    if (!grid || !healthData || !healthData.subsystems) return;

    const searchVal = (document.getElementById("cmd-palette")?.value || '').toLowerCase().trim();
    let html = '';
    const subs = healthData.subsystems;
    let visibleCount = 0;

    for (const name of Object.keys(subs)) {
      const item = subs[name];
      if (searchVal && !name.toLowerCase().includes(searchVal) && !item.status.toLowerCase().includes(searchVal)) {
        continue;
      }
      visibleCount++;
      const isOnline = item.status === 'online';
      const color = isOnline ? '#22c55e' : '#ef4444';
      
      let iconName = 'activity';
      if (name === 'database') iconName = 'database';
      if (name === 'docker') iconName = 'server';
      if (name === 'tunnel') iconName = 'tunnel';
      
      const iconHtml = getIcon(iconName);

      html += `
        <div class="res-card" style="padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; border-radius: 0; font-family: var(--font-mono);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 900; text-transform: uppercase; color: #ffffff; display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem;">
              ${iconHtml} ${name.replace('_', ' ')}
            </span>
            <span style="font-size: 0.62rem; padding: 0.15rem 0.45rem; border-radius: 0; background: #000000; border: 1px solid ${color}; color: ${color}; font-weight: 900; text-transform: uppercase;">
              ${item.status}
            </span>
          </div>
          
          <div style="font-size: 0.68rem; color: #a1a1aa; display: grid; grid-template-columns: 80px 1fr; gap: 0.35rem; margin-top: 0.5rem; font-family: var(--font-mono);">
            ${(name !== 'scheduler' && name !== 'metrics_collector') ? `
              <span style="text-transform: uppercase; font-weight: 800;">Latency:</span> <span style="color: #ffffff; font-weight: 900;">${item.latency || 'N/A'}</span>
            ` : ''}
            <span style="text-transform: uppercase; font-weight: 800;">Heartbeat:</span> <span style="color: #ffffff;">${new Date(item.lastHeartbeat).toLocaleTimeString()}</span>
            <span style="text-transform: uppercase; font-weight: 800;">Errors:</span> <span style="color: ${item.lastError ? '#ef4444' : '#a1a1aa'}; font-weight: 800;">${item.lastError || 'None'}</span>
          </div>
        </div>
      `;
    }

    if (visibleCount === 0) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; color: #a1a1aa; font-size: 0.75rem; text-align: center; padding: 2rem 0; font-family: var(--font-mono); font-weight: 800; text-transform: uppercase;">No matching health subsystems found.</div>`;
    } else {
      grid.innerHTML = html;
    }
  },

  updateMetricsUI() {
    const stats = store.get('metrics');
    const container = this.container?.querySelector('#system-info-grid');
    if (!container || !stats) return;

    const host = stats.hostInfo || {
      osName: stats.osName,
      hostname: stats.hostname,
      kernel: stats.kernel,
      uptime: stats.uptime
    };

    const containerInfo = stats.containerInfo || {
      osName: 'Alpine Linux',
      hostname: 'homelab-dashboard',
      kernel: stats.kernel,
      uptime: stats.uptime
    };

    container.innerHTML = `
      <!-- Host Platform specs -->
      <div class="res-card" style="padding: 1.25rem; background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; border-radius: 0; display: flex; flex-direction: column; gap: 0.6rem; font-family: var(--font-mono);">
        <div style="font-weight: 900; color: #ffffff; font-size: 0.8rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px dashed #33333e; padding-bottom: 0.5rem;">
          ${getIcon('server')} Host Node Platform Specification
        </div>
        <div style="font-size: 0.68rem; color: #a1a1aa; display: grid; grid-template-columns: 120px 1fr; gap: 0.4rem; margin-top: 0.25rem;">
          <span style="text-transform: uppercase; font-weight: 800;">Hostname:</span> <span style="color: #ffffff; font-weight: 900;">${host.hostname}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Operating System:</span> <span style="color: #ffffff; font-weight: 900;">${host.osName}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Kernel Release:</span> <span style="color: #ffffff; font-family: var(--font-mono);">${host.kernel}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Host Uptime:</span> <span style="color: #ffffff;">${host.uptime}</span>
          <span style="text-transform: uppercase; font-weight: 800;">IP Address:</span> <span style="color: #ffffff;">${stats.ipAddress || '127.0.0.1'}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Hardware Model:</span> <span style="font-size: 0.65rem; color: #ffffff;">${stats.cpuModel} (${stats.cpuCores} Cores)</span>
        </div>
      </div>

      <!-- Container local specs -->
      <div class="res-card" style="padding: 1.25rem; background: #0e0e11; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; border-radius: 0; display: flex; flex-direction: column; gap: 0.6rem; font-family: var(--font-mono);">
        <div style="font-weight: 900; color: #ffffff; font-size: 0.8rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px dashed #33333e; padding-bottom: 0.5rem;">
          ${getIcon('grid')} HomeLab Dashboard Container Context
        </div>
        <div style="font-size: 0.68rem; color: #a1a1aa; display: grid; grid-template-columns: 130px 1fr; gap: 0.4rem; margin-top: 0.25rem;">
          <span style="text-transform: uppercase; font-weight: 800;">Container Name/ID:</span> <span style="color: #ffffff; font-weight: 900; font-family: var(--font-mono);">${containerInfo.hostname}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Container OS:</span> <span style="color: #ffffff;">${containerInfo.osName}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Shared Kernel:</span> <span style="font-family: var(--font-mono); color: #ffffff;">${containerInfo.kernel}</span>
          <span style="text-transform: uppercase; font-weight: 800;">Process Uptime:</span> <span style="color: #ffffff;">${containerInfo.uptime}</span>
        </div>
      </div>
    `;
  }
};

export default AppHealth;
