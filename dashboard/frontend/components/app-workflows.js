// Workflow Automation Rules Builder Front-end Component
import { api } from '../core/api.js';

export const AppWorkflows = {
  container: null,
  rules: [],

  init(containerEl) {
    this.container = containerEl;
    this.loadRules();
  },

  async loadRules() {
    try {
      this.rules = await api.get('/api/v1/workflows');
      this.render();
    } catch (err) {
      console.error('Failed to load workflow automation rules:', err);
    }
  },

  render() {
    if (!this.container) return;

    let rulesHtml = '';
    if (this.rules.length === 0) {
      rulesHtml = '<div style="font-size: 0.75rem; color: var(--text-muted);">No automation workflow rules configured.</div>';
    } else {
      this.rules.forEach(rule => {
        let triggerDesc = '';
        if (rule.triggerType === 'metrics') {
          triggerDesc = `If ${rule.triggerConfig.metric?.toUpperCase()} load exceeds ${rule.triggerConfig.threshold}%`;
        } else if (rule.triggerType === 'event') {
          triggerDesc = `On event: ${rule.triggerConfig.eventName}`;
        }

        let actionDesc = '';
        rule.actions.forEach((act, idx) => {
          if (act.type === 'notification') {
            actionDesc += `${idx > 0 ? ', ' : ''}Notify ${act.config.channel} ("${act.config.message}")`;
          } else if (act.type === 'container_action') {
            actionDesc += `${idx > 0 ? ', ' : ''}${act.config.action.toUpperCase()} container [${act.config.serviceId}]`;
          } else if (act.type === 'backup') {
            actionDesc += `${idx > 0 ? ', ' : ''}Backup Database`;
          }
        });

        rulesHtml += `
          <div class="workflow-card-item" style="padding: 0.85rem; background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-slate); border-radius: 8px; display: flex; flex-direction: column; gap: 0.35rem; backdrop-filter: blur(10px);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.8rem; font-weight: 600; color: #fff;">${rule.name}</span>
              <button class="btn btn-card-act delete-rule-btn" data-id="${rule.id}" style="background: #ef4444; border: none; color: #fff; padding: 0.2rem 0.4rem; font-size: 0.6rem;">Delete</button>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-secondary);">
              <span style="color: var(--term-green); font-weight: 500;">WHEN:</span> ${triggerDesc}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-secondary);">
              <span style="color: #f59e0b; font-weight: 500;">THEN:</span> ${actionDesc}
            </div>
          </div>
        `;
      });
    }

    this.container.innerHTML = `
      <div class="workflows-layout" style="display: flex; flex-direction: column; gap: 1rem; color: var(--text-slate); height: 100%;">
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Infrastructure Automation Engine</h2>
          <span style="font-size: 0.7rem; color: var(--text-muted);">Configure rule-based triggers and automation workflow actions</span>
        </div>

        <div style="display: flex; gap: 1rem; flex: 1; flex-wrap: wrap; min-height: 450px;">
          <!-- Rules registry list -->
          <div class="workflows-list-panel" style="flex: 1.2; min-width: 320px; background: rgba(30, 41, 59, 0.25); border-radius: 8px; border: 1px solid var(--border-slate); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; height: calc(100vh - 180px); overflow-y: auto;">
            <span style="font-size: 0.75rem; font-weight: 600; color: #fff;">Active Automation Rules</span>
            <div id="workflows-list-container" style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${rulesHtml}
            </div>
          </div>

          <!-- Rules compiler form -->
          <div class="workflows-create-panel" style="flex: 1; min-width: 300px; background: rgba(30, 41, 59, 0.4); border-radius: 8px; border: 1px solid var(--border-slate); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; backdrop-filter: blur(10px);">
            <span style="font-size: 0.75rem; font-weight: 600; color: #fff; display: block; margin-bottom: 0.25rem;">Create New Workflow</span>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.7rem;">
              <label style="font-weight: 600; color: #fff;">Workflow Name</label>
              <input type="text" id="rule-name" placeholder="e.g. Alert Discord on High CPU" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.4rem; border-radius: 4px;">

              <!-- Trigger Selector -->
              <div style="margin-top: 0.5rem; border-top: 1px dashed var(--border-slate); padding-top: 0.5rem;">
                <label style="font-weight: 600; color: #fff; display: block; margin-bottom: 0.25rem;">Rule Trigger</label>
                <select id="rule-trigger-type" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.4rem; border-radius: 4px; width: 100%;">
                  <option value="metrics">Hardware Metrics Threshold</option>
                  <option value="event">System Event Occurred</option>
                </select>
                
                <div id="trigger-metrics-config" style="margin-top: 0.4rem; display: flex; gap: 0.5rem;">
                  <select id="rule-trigger-metric" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px; flex: 1;">
                    <option value="cpu">CPU Load</option>
                    <option value="ram">RAM Utilization</option>
                  </select>
                  <input type="number" id="rule-trigger-threshold" placeholder="90%" value="90" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px; width: 80px;">
                </div>
                
                <div id="trigger-event-config" style="margin-top: 0.4rem; display: none;">
                  <select id="rule-trigger-eventname" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px; width: 100%;">
                    <option value="container_updated">Container Updated (Watchtower)</option>
                    <option value="notification_created">Alert Notification Triggered</option>
                  </select>
                </div>
              </div>

              <!-- Action Selector -->
              <div style="margin-top: 0.5rem; border-top: 1px dashed var(--border-slate); padding-top: 0.5rem;">
                <label style="font-weight: 600; color: #fff; display: block; margin-bottom: 0.25rem;">Automation Action</label>
                <select id="rule-action-type" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.4rem; border-radius: 4px; width: 100%;">
                  <option value="notification">Send Notification Alert</option>
                  <option value="container_action">Execute Container Command</option>
                  <option value="backup">Trigger SQLite Backup</option>
                </select>

                <div id="action-notification-config" style="margin-top: 0.4rem; display: flex; flex-direction: column; gap: 0.3rem;">
                  <select id="rule-action-channel" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px;">
                    <option value="discord">Discord Channel Webhook</option>
                    <option value="telegram">Telegram Bot</option>
                    <option value="email">SMTP Email Client</option>
                  </select>
                  <input type="text" id="rule-action-message" placeholder="e.g. Warning: System CPU load exceeds 90%!" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px;">
                </div>

                <div id="action-container-config" style="margin-top: 0.4rem; display: none; gap: 0.5rem;">
                  <select id="rule-action-service" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px; flex: 1.2;">
                    <option value="cloudflare">cloudflare</option>
                    <option value="portainer">portainer</option>
                    <option value="grafana">grafana</option>
                  </select>
                  <select id="rule-action-command" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.3rem; border-radius: 4px; flex: 1;">
                    <option value="restart">Restart</option>
                    <option value="stop">Stop</option>
                    <option value="start">Start</option>
                  </select>
                </div>
              </div>

              <button class="btn btn-primary" id="btn-save-rule" style="background: var(--term-green); border: none; color: #000; font-weight: 600; padding: 0.5rem; margin-top: 0.75rem;">Compile & Save Workflow</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    // Handle toggle triggers config sections
    const triggerType = this.container.querySelector('#rule-trigger-type');
    const metricDiv = this.container.querySelector('#trigger-metrics-config');
    const eventDiv = this.container.querySelector('#trigger-event-config');
    
    if (triggerType) {
      triggerType.addEventListener('change', () => {
        if (triggerType.value === 'metrics') {
          metricDiv.style.display = 'flex';
          eventDiv.style.display = 'none';
        } else {
          metricDiv.style.display = 'none';
          eventDiv.style.display = 'block';
        }
      });
    }

    // Handle toggle actions config sections
    const actionType = this.container.querySelector('#rule-action-type');
    const notifyDiv = this.container.querySelector('#action-notification-config');
    const containerDiv = this.container.querySelector('#action-container-config');

    if (actionType) {
      actionType.addEventListener('change', () => {
        if (actionType.value === 'notification') {
          notifyDiv.style.display = 'flex';
          containerDiv.style.display = 'none';
        } else if (actionType.value === 'container_action') {
          notifyDiv.style.display = 'none';
          containerDiv.style.display = 'flex';
        } else {
          notifyDiv.style.display = 'none';
          containerDiv.style.display = 'none';
        }
      });
    }

    // Save action click
    const saveBtn = this.container.querySelector('#btn-save-rule');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = this.container.querySelector('#rule-name').value.trim();
        if (!name) {
          alert('Workflow name is required.');
          return;
        }

        // Build trigger config
        let triggerConfig = {};
        if (triggerType.value === 'metrics') {
          triggerConfig = {
            metric: this.container.querySelector('#rule-trigger-metric').value,
            threshold: Number(this.container.querySelector('#rule-trigger-threshold').value)
          };
        } else {
          triggerConfig = {
            eventName: this.container.querySelector('#rule-trigger-eventname').value
          };
        }

        // Build actions config
        const actionItem = { type: actionType.value, config: {} };
        if (actionType.value === 'notification') {
          actionItem.config = {
            channel: this.container.querySelector('#rule-action-channel').value,
            message: this.container.querySelector('#rule-action-message').value
          };
        } else if (actionType.value === 'container_action') {
          actionItem.config = {
            serviceId: this.container.querySelector('#rule-action-service').value,
            action: this.container.querySelector('#rule-action-command').value
          };
        }

        try {
          await api.post('/api/v1/workflows', {
            name,
            triggerType: triggerType.value,
            triggerConfig,
            actions: [actionItem],
            enabled: true
          });
          this.loadRules();
        } catch (err) {
          alert(`Workflow compilation failed: ${err.message}`);
        }
      });
    }

    // Delete actions
    this.container.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Delete this automated workflow?')) {
          try {
            await api.delete(`/api/v1/workflows/${id}`);
            this.loadRules();
          } catch (err) {
            alert(`Wipe failed: ${err.message}`);
          }
        }
      });
    });
  }
};
export default AppWorkflows;
