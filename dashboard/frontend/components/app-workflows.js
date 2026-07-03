// External Automation Platforms Management Component
import { api } from '../core/api.js';
import { store } from '../core/state.js';
import { getIcon } from '../utils/icons.js';

export const AppWorkflows = {
  container: null,
  platforms: [],
  intervalId: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();
    this.refreshPlatforms();

    // Auto-refresh states every 4 seconds
    this.intervalId = setInterval(() => this.refreshPlatforms(), 4000);
    window.activeAppDestroy = () => this.destroy();
  },

  async refreshPlatforms() {
    try {
      this.platforms = await api.get('/api/v1/automation/platforms');
      this.renderList();
    } catch (err) {
      console.error('Failed to load automation platforms:', err);
    }
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="workflows-layout" style="display: flex; flex-direction: column; gap: 1rem; color: var(--text-slate); height: 100%;">
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">External Automation Hub</h2>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Provision, monitor, and launch self-hosted workflow automation engines</span>
        </div>

        <div id="platforms-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Detecting automation engines...</div>
        </div>
      </div>
    `;
  },

  renderList() {
    const grid = this.container.querySelector('#platforms-grid');
    if (!this.platforms || this.platforms.length === 0) {
      grid.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 2rem 0; width: 100%;">No automation platforms detected.</div>`;
      return;
    }

    let html = '';
    const stats = store.get('metrics') || {};
    const hostIp = stats.ipAddress || window.location.hostname;

    this.platforms.forEach(platform => {
      const isInstalled = platform.status === 'installed';
      const isRunning = platform.running;

      let statusColor = 'var(--text-muted)';
      let statusText = 'Not Installed';
      if (isInstalled) {
        if (isRunning) {
          statusColor = 'var(--term-green)';
          statusText = 'Active / Running';
        } else {
          statusColor = '#ef4444';
          statusText = 'Stopped / Inactive';
        }
      }

      let actionsHtml = '';
      if (!isInstalled) {
        actionsHtml = `
          <button class="btn btn-primary btn-install-platform" data-id="${platform.id}" style="background: var(--term-green); border: none; color: #000; font-weight: 600; font-size: 0.7rem; padding: 0.4rem 0.8rem; border-radius: 4px; width: 100%;">
            Install & Launch Stack
          </button>
        `;
      } else {
        actionsHtml = `
          <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
            <div style="display: flex; gap: 0.4rem; width: 100%;">
              <button class="btn btn-card-act btn-launch-platform" data-url="http://${hostIp}:${platform.port}" style="flex: 1.5; font-weight: 600; color: #fff; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6;">
                Launch UI
              </button>
              <button class="btn btn-card-act btn-toggle-platform" data-id="${platform.id}" data-action="${isRunning ? 'stop' : 'start'}" style="flex: 1; background: rgba(255,255,255,0.05);">
                ${isRunning ? 'Stop' : 'Start'}
              </button>
            </div>
            <div style="display: flex; gap: 0.4rem; width: 100%;">
              <button class="btn btn-card-act btn-restart-platform" data-id="${platform.id}" style="flex: 1; background: rgba(255,255,255,0.05); font-size: 0.65rem; padding: 0.25rem;">
                Restart
              </button>
              <button class="btn btn-card-act btn-update-platform" data-id="${platform.id}" style="flex: 1; background: rgba(255,255,255,0.05); font-size: 0.65rem; padding: 0.25rem;">
                Update
              </button>
              <button class="btn btn-card-act btn-backup-platform" data-id="${platform.id}" style="flex: 1; background: rgba(255,255,255,0.05); font-size: 0.65rem; padding: 0.25rem;">
                Backup
              </button>
            </div>
          </div>
        `;
      }

      html += `
        <div class="platform-card" style="padding: 1.25rem; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-slate); border-radius: 8px; display: flex; flex-direction: column; gap: 0.75rem; backdrop-filter: blur(10px); position: relative; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
              <span style="font-size: 0.9rem; font-weight: 700; color: #fff;">${platform.name}</span>
              <span style="font-size: 0.6rem; font-weight: 700; color: ${statusColor}; border: 1px solid ${statusColor}; padding: 0.15rem 0.4rem; border-radius: 4px; text-transform: uppercase;">
                ${statusText}
              </span>
            </div>
            <p style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.4; margin: 0 0 1rem 0;">
              ${platform.description}
            </p>
          </div>
          <div>
            <div style="font-size: 0.65rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.75rem; border-top: 1px dashed var(--border-slate); padding-top: 0.5rem;">
              <span>Target Image: <span style="font-family: monospace; color: #fff;">${platform.image}</span></span>
              <span>Local Port: <span style="font-family: monospace; color: #fff;">${platform.port}</span></span>
            </div>
            ${actionsHtml}
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
    this.bindEvents();
  },

  bindEvents() {
    // Install triggers
    this.container.querySelectorAll('.btn-install-platform').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.textContent = 'Queuing installation...';
        btn.disabled = true;
        try {
          const res = await api.post(`/api/v1/automation/platforms/${id}/install`);
          alert(`Installation job queued. Asynchronous Job ID: ${res.jobId}.`);
          this.refreshPlatforms();
        } catch (err) {
          alert(`Failed to queue installation: ${err.message}`);
          this.refreshPlatforms();
        }
      });
    });

    // Launch action
    this.container.querySelectorAll('.btn-launch-platform').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        window.open(url, '_blank');
      });
    });

    // Toggle start/stop
    this.container.querySelectorAll('.btn-toggle-platform').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        try {
          const res = await api.post(`/api/v1/services/${id}/action`, { action });
          alert(`Action [${action.toUpperCase()}] triggered as job: ${res.jobId}`);
          this.refreshPlatforms();
        } catch (err) {
          alert(`Failed to trigger action: ${err.message}`);
        }
      });
    });

    // Restart
    this.container.querySelectorAll('.btn-restart-platform').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await api.post(`/api/v1/services/${id}/action`, { action: 'restart' });
          alert(`Restart job triggered: ${res.jobId}`);
          this.refreshPlatforms();
        } catch (err) {
          alert(`Failed to restart: ${err.message}`);
        }
      });
    });

    // Update
    this.container.querySelectorAll('.btn-update-platform').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await api.post(`/api/v1/services/${id}/action`, { action: 'update' });
          alert(`Update job triggered: ${res.jobId}`);
          this.refreshPlatforms();
        } catch (err) {
          alert(`Failed to trigger update: ${err.message}`);
        }
      });
    });

    // Backup
    this.container.querySelectorAll('.btn-backup-platform').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const res = await api.post(`/api/v1/backups/plugin/${id}`);
          alert(`Volume backup job triggered: ${res.jobId}`);
          this.refreshPlatforms();
        } catch (err) {
          alert(`Backup failed: ${err.message}`);
        }
      });
    });
  },

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
};

export default AppWorkflows;
