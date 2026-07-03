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

    // Initial render if status is already loaded
    const currentHealth = store.get('healthStatus');
    if (currentHealth) {
      this.updateUI(currentHealth);
    }
  },

  async render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="health-layout" style="display: flex; flex-direction: column; gap: 1rem; color: var(--text-slate);">
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">System Subsystems Health Check</h2>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Real-time metrics, response latency, and heartbeats</span>
        </div>

        <div id="health-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <div class="card card-loading">Gathering subsystem statuses...</div>
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
      if (name === 'tunnel') iconName = 'link';
      
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
            <span>Latency:</span> <span style="color: #fff; font-weight: 500;">${item.latency || 'N/A'}</span>
            <span>Heartbeat:</span> <span>${new Date(item.lastHeartbeat).toLocaleTimeString()}</span>
            <span>Errors:</span> <span style="color: ${item.lastError ? '#ef4444' : 'var(--text-muted)'};">${item.lastError || 'None'}</span>
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
  }
};

export default AppHealth;
