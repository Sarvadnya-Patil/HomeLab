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
  modalActive: false,
  modalOutputEl: null,

  render(container) {
    container.className = 'grid-terminal widget-item';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="panel-title">Server Console Terminal</span>
          <button class="btn btn-panel btn-expand-terminal" style="font-size: 0.6rem; padding: 0.15rem 0.35rem; display: flex; align-items: center; gap: 0.2rem;" title="Expand Terminal Log Viewer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            Expand
          </button>
        </div>
        <span class="console-host" id="w-term-host-label" style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">root@homelab-os</span>
      </div>
      <div class="terminal-body" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.85rem; font-family: var(--font-mono); font-size: 0.75rem; height: auto; flex: 1; overflow-y: auto; line-height: 1.45; display: flex; flex-direction: column; justify-content: space-between;">
        <div class="terminal-content" id="w-term-output" style="flex: 1; overflow-y: auto; margin-bottom: 0.5rem; white-space: pre-wrap;"><span class="cyan-text">root@homelab:~$</span> OS control console active. Type 'help' for commands.<br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span></div>
        <div class="terminal-input-row" style="display: flex; align-items: center; border-top: 1px solid var(--border-slate); padding-top: 0.5rem; margin-top: auto;">
          <span class="cyan-text" style="margin-right: 0.5rem; user-select: none;">root@homelab:~$</span>
          <input type="text" id="w-term-input" style="flex: 1; background: transparent; border: none; outline: none; color: var(--text-white); font-family: var(--font-mono); font-size: 0.75rem;" placeholder="Type command..." />
        </div>
      </div>
    `;

    // Hook up local command intercept listener
    this.logCallback = (output) => {
      const outputEl = container.querySelector('#w-term-output');
      if (!outputEl) return;
      const formatted = output.replace(/\n/g, '<br>');
      outputEl.innerHTML = `<span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>`;
      
      if (this.modalActive && this.modalOutputEl) {
        this.modalOutputEl.innerHTML = `<span class="white-text">${formatted}</span>`;
        this.modalOutputEl.scrollTop = this.modalOutputEl.scrollHeight;
      }

      const body = container.querySelector('.terminal-body');
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
      this.syncHeight(container);
    };

    const expandBtn = container.querySelector('.btn-expand-terminal');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        this.openExpandModal(container);
      });
    }

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

          // If streaming logs, stop streaming on manual command execution
          if (this.activeLogsServiceId) {
            WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
            this.activeLogsServiceId = null;
            const hostLabel = container.querySelector('#w-term-host-label');
            if (hostLabel) hostLabel.textContent = `root@homelab-os`;
            
            // Clear screen of logs first to show fresh command
            const outputEl = container.querySelector('#w-term-output');
            if (outputEl) outputEl.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>`;
          }

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
      this.syncHeight(container);
    }
  },

  update(container, data) {
    // Note: ws-client streams console updates directly into registered subscribers
  },

  syncHeight(container) {
    setTimeout(() => {
      const asciiEl = document.querySelector('#w-ingress-ascii');
      const ingressBody = document.querySelector('.grid-network-map .network-map-body');
      const terminalBody = container.querySelector('.terminal-body');
      if (asciiEl && ingressBody && terminalBody) {
        const linesCount = asciiEl.textContent.trim().split('\n').length;
        const calculatedHeight = Math.ceil(linesCount * 15.68) + 18; // 15.68px per line + 18px padding/borders
        const lockedHeight = Math.max(220, calculatedHeight);
        ingressBody.style.height = `${lockedHeight}px`;
        terminalBody.style.height = `${lockedHeight}px`;
      }
    }, 50);
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
    const threshold = 50; // pixels from bottom threshold to trigger auto-scroll
    
    let bodyScrolledToBottom = true;
    if (body) {
      bodyScrolledToBottom = (body.scrollHeight - body.scrollTop - body.clientHeight) <= threshold;
    }

    if (this.modalActive && this.modalOutputEl) {
      const modalScrolledToBottom = (this.modalOutputEl.scrollHeight - this.modalOutputEl.scrollTop - this.modalOutputEl.clientHeight) <= threshold;

      if (text === '__CLEAR__') {
        this.modalOutputEl.innerHTML = '';
      } else {
        const formatted = text.replace(/\n/g, '<br>');
        this.modalOutputEl.innerHTML += `<br><span class="white-text">${formatted}</span>`;
      }
      
      if (modalScrolledToBottom) {
        this.modalOutputEl.scrollTop = this.modalOutputEl.scrollHeight;
      }
    }

    if (body && bodyScrolledToBottom) {
      body.scrollTop = body.scrollHeight;
    }
    this.syncHeight(container);
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
      body.style.height = size === '2x2' ? '400px' : '260px';
    }
  },

  openExpandModal(container) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay terminal-expand-modal';
    modal.style.zIndex = '20000';
    
    const currentLogs = container.querySelector('#w-term-output').innerHTML;
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 1000px; width: 95%; height: 80vh; display: flex; flex-direction: column; background-color: var(--bg-panel); border: 1px solid var(--border-slate); border-radius: 8px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-slate);">
          <span style="font-weight: bold; text-transform: uppercase; font-size: 0.85rem; color: #fff;">Expanded Server Console Terminal</span>
          <button class="btn btn-close-modal" style="font-size: 1.5rem; background: transparent; border: none; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
        </div>
        <div class="modal-body" style="flex: 1; display: flex; flex-direction: column; background: var(--bg-shell); padding: 1rem; overflow: hidden; position: relative;">
          <div class="terminal-content" id="m-term-output" style="flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.45; white-space: pre-wrap; margin-bottom: 0.5rem; color: var(--text-primary);">${currentLogs}</div>
          <div class="terminal-input-row" style="display: flex; align-items: center; border-top: 1px solid var(--border-slate); padding-top: 0.5rem; margin-top: auto; background: var(--bg-shell);">
            <span class="cyan-text" style="margin-right: 0.5rem; user-select: none; font-family: var(--font-mono); font-size: 0.8rem;">root@homelab:~$</span>
            <input type="text" id="m-term-input" style="flex: 1; background: transparent; border: none; outline: none; color: var(--text-white); font-family: var(--font-mono); font-size: 0.8rem;" placeholder="Type command..." autocomplete="off" />
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const modalOutput = modal.querySelector('#m-term-output');
    if (modalOutput) modalOutput.scrollTop = modalOutput.scrollHeight;
    
    const modalInput = modal.querySelector('#m-term-input');
    if (modalInput) {
      modalInput.focus();
      modalInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const command = modalInput.value.trim();
          if (!command) return;
          modalInput.value = '';

          // If streaming logs, stop streaming on manual command execution
          if (this.activeLogsServiceId) {
            WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
            this.activeLogsServiceId = null;
            const hostLabel = container.querySelector('#w-term-host-label');
            if (hostLabel) hostLabel.textContent = `root@homelab-os`;
            
            // Clear screen of logs first to show fresh command
            const outputEl = container.querySelector('#w-term-output');
            if (outputEl) outputEl.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-cursor" class="cursor"></span>`;
            modalOutput.innerHTML = '';
          }

          // Display command in output
          this.appendOutput(container, `> ${command}`);

          try {
            const res = await api.post('/api/v1/terminal', { command });
            if (res && res.output) {
              this.appendOutput(container, res.output);
            }
          } catch (err) {
            this.appendOutput(container, `Execution error: ${err.message}`);
          }
        }
      });
      
      modal.querySelector('.modal-body').addEventListener('click', () => {
        modalInput.focus();
      });
    }
    
    const closeBtn = modal.querySelector('.btn-close-modal');
    closeBtn.addEventListener('click', () => {
      this.modalActive = false;
      this.modalOutputEl = null;
      modal.remove();
    });
    
    this.modalActive = true;
    this.modalOutputEl = modalOutput;
  },

  destroy(container) {
    if (this.activeLogsServiceId) {
      WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
    }
    this.modalActive = false;
    this.modalOutputEl = null;
  }
};
