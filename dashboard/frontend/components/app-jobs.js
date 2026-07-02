// Asynchronous Job Center Dashboard Component
import { api } from '../core/api.js';

export const AppJobs = {
  container: null,
  jobs: [],
  selectedJobId: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();
    this.refreshJobs();
    
    // Auto refresh lists every 4 seconds
    this.intervalId = setInterval(() => this.refreshJobs(), 4000);
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="jobs-layout" style="display: flex; flex-direction: column; height: 100%; gap: 1rem; color: var(--text-slate);">
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Asynchronous Job Center</h2>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Monitor progress, run logs, and execution histories</span>
        </div>

        <div style="display: flex; flex: 1; gap: 1rem; min-height: 400px; height: calc(100vh - 180px);">
          <!-- Jobs list -->
          <div class="jobs-list-panel" style="flex: 1; background: rgba(30, 41, 59, 0.3); border-radius: 8px; border: 1px solid var(--border-slate); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto;">
            <span style="font-size: 0.75rem; font-weight: 600; color: #fff; display: block; margin-bottom: 0.25rem;">Active & Historical Jobs</span>
            <div id="jobs-cards-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">Loading job list...</div>
            </div>
          </div>

          <!-- Job Console Output logs -->
          <div class="jobs-details-panel" style="flex: 1.2; background: rgba(15, 23, 42, 0.8); border-radius: 8px; border: 1px solid var(--border-slate); padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; font-weight: 600; color: #fff;">Job Run Console Console</span>
              <button class="btn btn-card-act" id="btn-job-retry" style="display: none; background: rgba(255, 255, 255, 0.05); font-size: 0.65rem;">Retry Job</button>
            </div>
            
            <div id="job-console-output" style="flex: 1; background: #000; border-radius: 4px; padding: 0.75rem; font-family: 'Courier New', monospace; font-size: 0.7rem; color: var(--term-green); overflow-y: auto; white-space: pre-wrap; border: 1px solid rgba(255,255,255,0.05);">
              Select a job from the list to view runtime console logs output.
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async refreshJobs() {
    try {
      this.jobs = await api.get('/api/v1/jobs?limit=30');
      const container = this.container.querySelector('#jobs-cards-container');
      if (!container) return;

      if (this.jobs.length === 0) {
        container.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted);">No background job records found.</div>';
        return;
      }

      let html = '';
      this.jobs.forEach(job => {
        const isSelected = job.id === this.selectedJobId;
        
        let statusColor = 'var(--text-muted)';
        if (job.status === 'running') statusColor = 'var(--term-green)';
        if (job.status === 'success') statusColor = '#22c55e';
        if (job.status === 'failed') statusColor = '#ef4444';

        html += `
          <div class="job-card-item" data-id="${job.id}" style="padding: 0.75rem; background: ${isSelected ? 'rgba(255, 255, 255, 0.07)' : 'rgba(30, 41, 59, 0.4)'}; border: 1px solid ${isSelected ? 'var(--term-green)' : 'var(--border-slate)'}; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; gap: 0.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; font-weight: 600; color: #fff;">${job.type.replace('_', ' ')}</span>
              <span style="font-size: 0.65rem; color: ${statusColor}; font-weight: 600; text-transform: uppercase;">${job.status}</span>
            </div>
            
            <div style="font-size: 0.65rem; color: var(--text-muted);">ID: ${job.id}</div>
            
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
              <div class="res-bar-container" style="flex: 1; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden;">
                <div style="width: ${job.progress}%; background: ${job.status === 'failed' ? '#ef4444' : 'var(--term-green)'}; height: 100%;"></div>
              </div>
              <span style="font-size: 0.65rem; color: #fff; font-weight: 600;">${job.progress}%</span>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
      this.bindCards();

      // Refresh console logs output for selected job if running
      if (this.selectedJobId) {
        const activeJob = this.jobs.find(j => j.id === this.selectedJobId);
        if (activeJob) {
          this.renderConsole(activeJob);
        }
      }
    } catch (err) {
      console.error('Failed to reload jobs logs:', err);
    }
  },

  bindCards() {
    this.container.querySelectorAll('.job-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        this.selectedJobId = id;
        
        // Highlight active card
        this.container.querySelectorAll('.job-card-item').forEach(c => c.style.borderColor = 'var(--border-slate)');
        card.style.borderColor = 'var(--term-green)';

        const job = this.jobs.find(j => j.id === id);
        if (job) {
          this.renderConsole(job);
        }
      });
    });
  },

  renderConsole(job) {
    const consoleBox = this.container.querySelector('#job-console-output');
    if (!consoleBox) return;

    consoleBox.textContent = job.logs || 'Console output empty.';
    
    // Scroll consoleBox to bottom
    consoleBox.scrollTop = consoleBox.scrollHeight;

    // Retry option
    const retryBtn = this.container.querySelector('#btn-job-retry');
    if (retryBtn) {
      if (job.status === 'failed') {
        retryBtn.style.display = 'block';
        retryBtn.onclick = () => this.retryJobAction(job);
      } else {
        retryBtn.style.display = 'none';
      }
    }
  },

  async retryJobAction(job) {
    try {
      alert(`Triggering job retry: [${job.type}]`);
      if (job.type.startsWith('container_') && job.targetId) {
        const action = job.type.split('_')[1];
        await api.post(`/api/v1/services/${job.targetId}/action`, { action });
      } else if (job.type === 'deploy_designer_stack') {
        // Retry visual stack deploy with empty canvas defaults
        await api.post('/api/v1/designer/deploy', { nodes: [], links: [] });
      }
      this.refreshJobs();
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
    }
  },

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
};
export default AppJobs;
