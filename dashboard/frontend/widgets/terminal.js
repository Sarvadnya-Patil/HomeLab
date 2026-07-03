// Terminal console widget module
import { WsClient } from '../core/ws-client.js';
import { api } from '../core/api.js';

export default {
  id: 'terminal',
  title: 'Terminal Console',
  icon: 'terminal',
  supportedSizes: ['2x1', '2x2'],
  wsEvents: ['terminal'],
  logCallback: null,
  activeLogsServiceId: null,

  render(container) {
    container.className = 'grid-terminal widget-item';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title">Server Console Terminal</span>
        <span class="console-host" id="w-term-host-label" style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">root@homelab-os</span>
      </div>
      <div class="terminal-body" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.85rem; font-family: var(--font-mono); font-size: 0.75rem; height: 180px; overflow-y: auto; line-height: 1.45; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="terminal-content" id="w-term-output" style="flex: 1; overflow-y: auto; margin-bottom: 0.5rem; white-space: pre-wrap;">
          <span class="cyan-text">root@homelab:~$</span> OS control console active. Type 'help' for commands.<br><br>
          <span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>
        </div>
        <div class="terminal-input-row" style="display: flex; align-items: center; border-top: 1px solid var(--border-slate); padding-top: 0.5rem; margin-top: auto;">
          <span class="cyan-text" style="margin-right: 0.5rem; user-select: none;">root@homelab:~$</span>
          <input type="text" id="w-term-input" style="flex: 1; background: transparent; border: none; outline: none; color: var(--text-white); font-family: var(--font-mono); font-size: 0.75rem;" placeholder="Type command..." />
        </div>
      </div>
    `;

    // Hook up local command intercept listener
    this.logCallback = (output) => this.appendOutput(container, output);

    const inputField = container.querySelector('#w-term-input');
    const body = container.querySelector('.terminal-body');

    if (body && inputField) {
      body.addEventListener('click', () => {
        inputField.focus();
      });
    }

    if (inputField) {
      inputField.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const command = inputField.value.trim();
          if (!command) return;
          inputField.value = '';

          // Display command in output
          this.appendOutput(container, `> ${command}`);

          try {
            const res = await api.post('/api/v1/terminal', { command });
            if (res && res.output) {
              this.appendOutput(container, res.output);
            } else {
              this.appendOutput(container, 'Command executed (no output).');
            }
          } catch (err) {
            this.appendOutput(container, `Error: ${err.message}`);
          }
        }
      });
    }
  },

  update(container, data) {
    // Note: ws-client streams console updates directly into registered subscribers
  },

  appendOutput(container, text) {
    const output = container.querySelector('#w-term-output');
    if (!output) return;

    // Remove cursor temp
    const cursor = output.querySelector('#w-term-cursor');
    if (cursor) cursor.remove();

    if (text === '__CLEAR__') {
      output.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>`;
    } else {
      const formatted = text.replace(/\n/g, '<br>');
      output.innerHTML += `<br><span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>`;
    }

    const body = container.querySelector('.terminal-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  },

  // Log streaming handler from service lifecycle triggers
  async startLogsStream(container, serviceId) {
    const hostLabel = container.querySelector('#w-term-host-label');
    if (hostLabel) hostLabel.textContent = `docker logs -f ${serviceId}`;

    this.appendOutput(container, `Connecting container logs stream for: ${serviceId}...`);
    
    if (this.activeLogsServiceId) {
      WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
    }

    this.activeLogsServiceId = serviceId;
    WsClient.subscribeLogs(serviceId, this.logCallback);
  },

  resize(container, size) {
    const body = container.querySelector('.terminal-body');
    if (body) {
      body.style.height = size === '2x2' ? '360px' : '180px';
    }
  },

  destroy(container) {
    if (this.activeLogsServiceId) {
      WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
    }
  }
};
