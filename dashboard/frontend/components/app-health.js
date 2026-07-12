// System Subsystems Health Check Dashboard Component
import { store } from '../core/state.js';
import { getIcon } from '../utils/icons.js';

export const AppHealth = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();

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
  },

  async render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="health-layout" style="display: flex; flex-direction: column; gap: 1rem; color: var(--text-slate); height: 100%;">
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">System Subsystems Health Check</h2>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Real-time metrics, response latency, and heartbeats</span>
        </div>

        <div id="health-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line text"></div>
            <div class="skeleton-line short"></div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line text"></div>
            <div class="skeleton-line short"></div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line text"></div>
            <div class="skeleton-line short"></div>
          </div>
        </div>

        <div style="margin-top: 1rem; border-top: 1px dashed var(--border-slate); padding-top: 1rem;">
          <h3 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; color: #fff; font-weight: 600;">System Information Overview</h3>
          <div id="system-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
            <div class="skeleton-card">
              <div class="skeleton-line title"></div>
              <div class="skeleton-line text"></div>
              <div class="skeleton-line short"></div>
            </div>
            <div class="skeleton-card">
              <div class="skeleton-line title"></div>
              <div class="skeleton-line text"></div>
              <div class="skeleton-line short"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  updateUI(healthData) {
    const grid = this.container?.querySelector('#health-grid');
    if (!grid || !healthData || !healthData.subsystems) return;

    let html = '';
    const subs = healthData.subsystems;

    for (const name of Object.keys(subs)) {
      const item = subs[name];
      const isOnline = item.status === 'online';
      const color = isOnline ? 'var(--term-green)' : '#ef4444';
      
      let iconName = 'activity';
      if (name === 'database') iconName = 'database';
      if (name === 'docker') iconName = 'server';
      if (name === 'tunnel') iconName = 'tunnel';
      
      const iconHtml = getIcon(iconName);

      html += `
        <div class="res-card" style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-slate); border-radius: 8px; backdrop-filter: blur(10px);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; text-transform: capitalize; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              ${iconHtml} ${name.replace('_', ' ')}
            </span>
            <span style="font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: ${isOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${color}; font-weight: 600; text-transform: uppercase;">
              ${item.status}
            </span>
          </div>
          
          <div style="font-size: 0.7rem; color: var(--text-muted); display: grid; grid-template-columns: 80px 1fr; gap: 0.25rem; margin-top: 0.5rem;">
            ${(name !== 'scheduler' && name !== 'metrics_collector') ? `
              <span>Latency:</span> <span style="color: #fff; font-weight: 500;">${item.latency || 'N/A'}</span>
            ` : ''}
            <span>Heartbeat:</span> <span>${new Date(item.lastHeartbeat).toLocaleTimeString()}</span>
            <span>Errors:</span> <span style="color: ${item.lastError ? '#ef4444' : 'var(--text-muted)'};">${item.lastError || 'None'}</span>
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
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
      <div class="res-card" style="padding: 1.25rem; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-slate); border-radius: 8px; backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="font-weight: 700; color: #fff; font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
          ${getIcon('server')} Host Node Platform Specification
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); display: grid; grid-template-columns: 110px 1fr; gap: 0.35rem; margin-top: 0.25rem;">
          <span>Hostname:</span> <span style="color: #fff; font-weight: 600;">${host.hostname}</span>
          <span>Operating System:</span> <span style="color: #fff; font-weight: 600;">${host.osName}</span>
          <span>Kernel Release:</span> <span style="color: #fff; font-family: monospace;">${host.kernel}</span>
          <span>Host Uptime:</span> <span style="color: #fff;">${host.uptime}</span>
          <span>IP Address:</span> <span>${stats.ipAddress || '127.0.0.1'}</span>
          <span>Hardware Model:</span> <span style="font-size: 0.65rem;">${stats.cpuModel} (${stats.cpuCores} Cores)</span>
        </div>
      </div>

      <!-- Container local specs -->
      <div class="res-card" style="padding: 1.25rem; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-slate); border-radius: 8px; backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="font-weight: 700; color: #fff; font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
          ${getIcon('grid')} HomeLab Dashboard Container Context
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); display: grid; grid-template-columns: 110px 1fr; gap: 0.35rem; margin-top: 0.25rem;">
          <span>Container Name/ID:</span> <span style="color: #fff; font-weight: 600; font-family: monospace;">${containerInfo.hostname}</span>
          <span>Container OS:</span> <span style="color: #fff;">${containerInfo.osName}</span>
          <span>Shared Kernel:</span> <span style="font-family: monospace;">${containerInfo.kernel}</span>
          <span>Process Uptime:</span> <span style="color: #fff;">${containerInfo.uptime}</span>
        </div>
      </div>
    `;
  }
};

export default AppHealth;
