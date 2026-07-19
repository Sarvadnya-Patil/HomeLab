// Centralized Job Execution Manager Component
import { api } from '../core/api.js';
import { Dialog } from '../utils/dialog.js';

export const AppJobs = {
  container: null,
  jobs: [],
  selectedJobId: null,
  activeTab: 'active', // 'active' | 'history'
  intervalId: null,

  init(containerEl) {
    this.container = containerEl;
    this.activeTab = 'active';

    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      this.onSearchInput = () => {
        this.renderJobsList();
      };
      mainSearchBar.addEventListener('input', this.onSearchInput);
    }

    this.render();
    this.refreshJobs();
    
    // Auto refresh lists every 3 seconds
    this.intervalId = setInterval(() => this.refreshJobs(), 3000);
    window.activeAppDestroy = () => this.destroy();
  },

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar && this.onSearchInput) {
      mainSearchBar.removeEventListener('input', this.onSearchInput);
    }
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="jobs-layout" style="display: flex; flex-direction: column; height: 100%; gap: 1rem; color: var(--text-slate);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Centralized Job Execution Manager</h2>
            <span style="font-size: 0.7rem; color: var(--text-muted);">Track long-running deployments, updates, backups, and container actions</span>
          </div>
          <div style="display: flex; gap: 0.25rem; background: rgba(30, 41, 59, 0.4); padding: 0.2rem; border-radius: 6px; border: 1px solid var(--border-slate);">
            <button class="btn btn-panel" id="tab-btn-active" style="padding: 0.3rem 0.6rem; font-size: 0.65rem; border: none;">Active Operations</button>
            <button class="btn btn-panel" id="tab-btn-history" style="padding: 0.3rem 0.6rem; font-size: 0.65rem; border: none;">Execution History</button>
          </div>
        </div>

        <div style="display: flex; flex: 1; gap: 1rem; min-height: 400px; height: calc(100vh - 190px);">
          <div class="jobs-list-panel" style="flex: 1; min-width: 280px; background: rgba(30, 41, 59, 0.2); border-radius: 8px; border: 1px solid var(--border-slate); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto;">
            <div id="jobs-cards-container" style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
              <div class="circular-loader-overlay" style="min-height: 180px;">
                <div class="circular-spinner"></div>
                <span class="circular-loader-text">SYNCING ACTIVE JOBS...</span>
              </div>
            </div>
          </div>

          <!-- Job Console Output logs -->
          <div class="jobs-details-panel" style="flex: 1.5; background: rgba(15, 23, 42, 0.85); border-radius: 8px; border: 1px solid var(--border-slate); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; backdrop-filter: blur(10px);">
            <div id="job-details-header" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; display: none;">
              <!-- Dynamic Details Header -->
            </div>
            
            <div id="job-console-output" style="flex: 1; background: #000; border-radius: 6px; padding: 0.85rem; font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 0.7rem; color: var(--term-green); overflow-y: auto; white-space: pre-wrap; border: 1px solid rgba(255,255,255,0.05); line-height: 1.4;">
              Select an execution job from the left panel to inspect real-time log output and status metrics.
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#tab-btn-active').addEventListener('click', () => this.switchTab('active'));
    this.container.querySelector('#tab-btn-history').addEventListener('click', () => this.switchTab('history'));
    this.updateTabButtons();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.updateTabButtons();
    this.renderJobsList();
  },

  updateTabButtons() {
    const btnActive = this.container.querySelector('#tab-btn-active');
    const btnHistory = this.container.querySelector('#tab-btn-history');
    if (!btnActive || !btnHistory) return;

    if (this.activeTab === 'active') {
      btnActive.style.background = 'rgba(255, 255, 255, 0.08)';
      btnActive.style.color = '#fff';
      btnHistory.style.background = 'transparent';
      btnHistory.style.color = 'var(--text-muted)';
    } else {
      btnHistory.style.background = 'rgba(255, 255, 255, 0.08)';
      btnHistory.style.color = '#fff';
      btnActive.style.background = 'transparent';
      btnActive.style.color = 'var(--text-muted)';
    }
  },

  async refreshJobs() {
    try {
      this.jobs = await api.get('/api/v1/jobs?limit=50');
      
      const hasActive = this.jobs.some(j => j.status === 'running' || j.status === 'pending');
      if (!hasActive && this.activeTab === 'active' && this.jobs.length > 0) {
        this.activeTab = 'history';
        this.updateTabButtons();
      }

      this.renderJobsList();
      
      // Update selected job logs
      if (this.selectedJobId) {
        const activeJob = this.jobs.find(j => j.id === this.selectedJobId);
        if (activeJob) {
          this.renderDetails(activeJob);
        }
      }
    } catch (err) {
      console.error('Failed to load executing jobs:', err);
    }
  },

  calculateRuntime(createdStr, updatedStr, status) {
    if (!createdStr) return '0s';
    const start = new Date(createdStr.replace(' ', 'T') + 'Z');
    const end = (status === 'running' || status === 'pending') ? new Date() : new Date(updatedStr.replace(' ', 'T') + 'Z');
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs < 0) return '0s';
    const diffSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  },

  renderJobsList() {
    const container = this.container.querySelector('#jobs-cards-container');
    if (!container) return;

    const searchVal = (document.getElementById("cmd-palette")?.value || '').toLowerCase().trim();

    // Filter jobs by active tab and search query
    const filtered = this.jobs.filter(job => {
      const isActive = job.status === 'running' || job.status === 'pending';
      const tabMatches = this.activeTab === 'active' ? isActive : !isActive;
      if (!tabMatches) return false;

      if (searchVal) {
        if (searchVal.startsWith('/title')) {
          const queryPart = searchVal.replace(/^\/title[:=\s]*/, '').trim();
          const jobTitle = (job.type || '').replace(/_/g, ' ').toLowerCase();
          return jobTitle.includes(queryPart);
        } else if (searchVal.startsWith('/target')) {
          const queryPart = searchVal.replace(/^\/target[:=\s]*/, '').trim();
          const jobTarget = (job.targetId || 'system').toLowerCase();
          return jobTarget.includes(queryPart);
        } else {
          const jobTitle = (job.type || '').replace(/_/g, ' ').toLowerCase();
          const jobTarget = (job.targetId || 'system').toLowerCase();
          return jobTitle.includes(searchVal) || jobTarget.includes(searchVal);
        }
      }
      return true;
    });

    if (this.jobs.length === 0) {
      container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 2rem 0;">No jobs have been executed yet.</div>`;
      const header = this.container.querySelector('#job-details-header');
      const consoleBox = this.container.querySelector('#job-console-output');
      if (header && consoleBox) {
        header.style.display = 'none';
        consoleBox.innerHTML = 'Select an execution job from the left panel to inspect real-time log output and status metrics.';
      }
      return;
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 2rem 0;">No ${this.activeTab} jobs found.</div>`;
      const header = this.container.querySelector('#job-details-header');
      const consoleBox = this.container.querySelector('#job-console-output');
      if (header && consoleBox) {
        header.style.display = 'none';
        consoleBox.innerHTML = 'Select an execution job from the left panel to inspect real-time log output and status metrics.';
      }
      return;
    }

    // Auto-select first job in the current list if nothing is selected or selection is obsolete
    if (filtered.length > 0) {
      const match = filtered.find(j => j.id === this.selectedJobId);
      if (!match) {
        this.selectedJobId = filtered[0].id;
        this.renderDetails(filtered[0]);
      }
    }

    let html = '';
    filtered.forEach(job => {
      const isSelected = job.id === this.selectedJobId;
      
      let statusColor = 'var(--text-muted)';
      if (job.status === 'running') statusColor = 'var(--term-green)';
      if (job.status === 'success') statusColor = '#22c55e';
      if (job.status === 'failed') statusColor = '#ef4444';

      const runtime = this.calculateRuntime(job.createdAt, job.updatedAt, job.status);

      html += `
        <div class="job-card-item" data-id="${job.id}" style="padding: 0.85rem; background: ${isSelected ? 'rgba(255, 255, 255, 0.06)' : 'rgba(30, 41, 59, 0.4)'}; border: 1px solid ${isSelected ? 'var(--term-green)' : 'var(--border-slate)'}; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; gap: 0.35rem; transition: background 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #fff; text-transform: capitalize;">${job.type.replace(/_/g, ' ')}</span>
            <span style="font-size: 0.6rem; color: ${statusColor}; border: 1px solid ${statusColor}; padding: 0.1rem 0.3rem; border-radius: 4px; font-weight: 700; text-transform: uppercase;">${job.status}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: var(--text-muted);">
            <span>Target: <span style="color: #fff;">${job.targetId || 'System'}</span></span>
            <span>Runtime: <span style="color: #fff;">${runtime}</span></span>
          </div>
          
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.15rem;">
            <div class="res-bar-container" style="flex: 1; height: 5px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden;">
              <div style="width: ${job.progress}%; background: ${job.status === 'failed' ? '#ef4444' : 'var(--term-green)'}; height: 100%;"></div>
            </div>
            <span style="font-size: 0.65rem; color: #fff; font-weight: 600;">${job.progress}%</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.bindCards();
  },

  bindCards() {
    this.container.querySelectorAll('.job-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        this.selectedJobId = id;
        
        // Highlight card
        this.container.querySelectorAll('.job-card-item').forEach(c => {
          c.style.borderColor = 'var(--border-slate)';
          c.style.background = 'rgba(30, 41, 59, 0.4)';
        });
        card.style.borderColor = 'var(--term-green)';
        card.style.background = 'rgba(255, 255, 255, 0.06)';

        const job = this.jobs.find(j => j.id === id);
        if (job) {
          this.renderDetails(job);
        }
      });
    });
  },

  renderDetails(job) {
    const header = this.container.querySelector('#job-details-header');
    const consoleBox = this.container.querySelector('#job-console-output');
    if (!header || !consoleBox) return;

    header.style.display = 'block';

    const runtime = this.calculateRuntime(job.createdAt, job.updatedAt, job.status);
    const isRunning = job.status === 'running' || job.status === 'pending';

    header.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span style="font-size: 0.85rem; font-weight: 700; color: #fff; text-transform: capitalize;">${job.type.replace(/_/g, ' ')}</span>
          <div style="font-size: 0.6rem; color: var(--text-muted); margin-top: 0.15rem;">
            <span>ID: <span style="font-family: monospace; color: var(--text-secondary);">${job.id}</span></span>
            <span style="margin: 0 0.4rem;">•</span>
            <span>Elapsed Time: <span style="color: #fff;">${runtime}</span></span>
            <span style="margin: 0 0.4rem;">•</span>
            <span>Target Resource: <span style="color: #fff;">${job.targetId || 'System'}</span></span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${isRunning ? `
            <button class="btn" id="btn-job-abort" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fff; font-size: 0.65rem; font-weight: 600; padding: 0.3rem 0.6rem; border-radius: 4px;">
              Abort Execution
            </button>
          ` : ''}
          ${job.status === 'failed' ? `
            <button class="btn" id="btn-job-retry" style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #fff; font-size: 0.65rem; font-weight: 600; padding: 0.3rem 0.6rem; border-radius: 4px;">
              Retry Job
            </button>
          ` : ''}
        </div>
      </div>
    `;

    consoleBox.textContent = job.logs || 'No log buffer output captured.';
    consoleBox.scrollTop = consoleBox.scrollHeight;

    // Bind abort button
    const abortBtn = header.querySelector('#btn-job-abort');
    if (abortBtn) {
      abortBtn.addEventListener('click', async () => {
        const confirmAbort = await Dialog.confirm({
          title: 'Abort Operations Thread',
          message: 'Are you sure you want to abort this active operations thread?'
        });
        if (confirmAbort) {
          try {
            await api.post(`/api/v1/jobs/${job.id}/cancel`);
            this.refreshJobs();
          } catch (err) {
            console.error(`Failed to abort job: ${err.message}`);
          }
        }
      });
    }

    // Bind retry button
    const retryBtn = header.querySelector('#btn-job-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.retryJobAction(job));
    }
  },

  async retryJobAction(job) {
    try {
      alert(`Re-triggering operational queue task: [${job.type.replace(/_/g, ' ')}]`);
      if (job.type.startsWith('container_') && job.targetId) {
        const action = job.type.split('_')[1];
        await api.post(`/api/v1/services/${job.targetId}/action`, { action });
      } else if (job.type === 'deploy_designer_stack') {
        await api.post('/api/v1/designer/deploy', { nodes: [], links: [] });
      } else if (job.type === 'system_backup') {
        await api.post('/api/v1/backups/db');
      } else if (job.type === 'plugin_backup' && job.targetId) {
        await api.post(`/api/v1/backups/plugin/${job.targetId}`);
      } else if (job.type === 'pull_image' && job.targetId) {
        await api.post('/api/v1/docker/images', { image: job.targetId });
      }
      this.refreshJobs();
    } catch (err) {
      alert(`Retry dispatch failed: ${err.message}`);
    }
  },

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
};

export default AppJobs;
