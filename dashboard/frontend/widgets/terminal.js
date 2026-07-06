// Terminal console widget module
import { WsClient } from '../core/ws-client.js';
import { api } from '../core/api.js';

// Premium ANSI escape-code parsing and color conversion utility
function ansiToHtml(text) {
  if (!text) return '';
  
  const ansiColors = {
    '0': 'reset',
    '1': 'font-weight: bold;',
    '4': 'text-decoration: underline;',
    
    // Foreground colors (Catppuccin Macchiato based styling)
    '30': 'color: #11111b;', // black
    '31': 'color: #f38ba8;', // red
    '32': 'color: #a6e3a1;', // green
    '33': 'color: #f9e2af;', // yellow
    '34': 'color: #89b4fa;', // blue
    '35': 'color: #cba6f7;', // magenta
    '36': 'color: #89dceb;', // cyan
    '37': 'color: #cdd6f4;', // white
    
    // Bright/High-intensity foreground colors
    '90': 'color: #585b70;', // gray/bright black
    '91': 'color: #f38ba8; font-weight: bold;',
    '92': 'color: #a6e3a1; font-weight: bold;',
    '93': 'color: #f9e2af; font-weight: bold;',
    '94': 'color: #89b4fa; font-weight: bold;',
    '95': 'color: #cba6f7; font-weight: bold;',
    '96': 'color: #89dceb; font-weight: bold;',
    '97': 'color: #cdd6f4; font-weight: bold;'
  };

  // Match escape sequences (ESC codes, string escapes, control chars) followed by codes and 'm'
  const regex = /(?:\x1b|\u001b|\\u001b|\\x1b||[\x00-\x1F\x7F])\[([0-9;]*)m/g;
  
  let openSpanCount = 0;
  let html = text.replace(regex, (match, codesRaw) => {
    const codes = codesRaw.split(';');
    
    // Reset or blank styles
    if (codes.includes('0') || codesRaw === '') {
      let closeSpans = '';
      while (openSpanCount > 0) {
        closeSpans += '</span>';
        openSpanCount--;
      }
      return closeSpans;
    }
    
    let styles = '';
    codes.forEach(code => {
      if (ansiColors[code]) {
        styles += ansiColors[code] + ' ';
      }
    });
    
    if (styles) {
      openSpanCount++;
      return `<span style="${styles.trim()}">`;
    }
    
    return '';
  });
  
  // Close any unclosed span elements
  while (openSpanCount > 0) {
    html += '</span>';
    openSpanCount--;
  }
  
  // Strip out remaining raw non-printable control characters
  html = html.replace(/[\x00-\x1F\x7F]/g, '');
  
  return html.replace(/\n/g, '<br>');
}

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
    container.style.position = 'relative';
    container.style.minHeight = '220px';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; min-height: 28px; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="panel-title">Server Console Terminal</span>
          <button class="btn btn-panel btn-expand-terminal" style="font-size: 0.6rem; padding: 0.15rem 0.35rem; display: flex; align-items: center; gap: 0.2rem;" title="Expand Terminal Log Viewer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            Expand
          </button>
        </div>
        <span class="console-host" id="w-term-host-label" style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">root@homelab-os</span>
      </div>
      <div class="terminal-body" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.85rem; font-family: var(--font-mono); font-size: 0.75rem; line-height: 1.45; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; box-sizing: border-box; flex: 1; min-height: 0;">
        <div class="terminal-content" id="w-term-output" style="flex: 1; overflow-y: auto; margin-bottom: 0.5rem; white-space: pre-wrap;"><span class="cyan-text">root@homelab:~$</span> OS control console active. Type 'help' for commands.<br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="w-term-cursor" class="cursor"></span></div>
        <input type="text" id="w-term-input" style="opacity: 0; position: absolute; width: 0; height: 0; pointer-events: none;" autocomplete="off" />
      </div>
    `;

    // Hook up local command intercept listener
    this.logCallback = (output) => {
      const outputEl = container.querySelector('#w-term-output');
      if (!outputEl) return;
      
      const threshold = 50; // pixels from bottom threshold to trigger auto-scroll
      
      const outputScrolledToBottom = (outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight) <= threshold;

      let modalScrolledToBottom = true;
      if (this.modalActive && this.modalOutputEl) {
        modalScrolledToBottom = (this.modalOutputEl.scrollHeight - this.modalOutputEl.scrollTop - this.modalOutputEl.clientHeight) <= threshold;
      }

      const inputEl = container.querySelector('#w-term-input');
      const currentInputValue = inputEl ? inputEl.value : '';

      const formatted = ansiToHtml(output);
      outputEl.innerHTML = `<span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;">${currentInputValue}</span><span id="w-term-cursor" class="cursor"></span>`;
      
      if (this.modalActive && this.modalOutputEl) {
        const mInput = document.querySelector('#m-term-input');
        const currentModalInputValue = mInput ? mInput.value : '';
        this.modalOutputEl.innerHTML = `<span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="m-term-input-text" style="color: var(--text-white); white-space: pre-wrap;">${currentModalInputValue}</span><span id="m-term-cursor" class="cursor"></span>`;
        if (modalScrolledToBottom) {
          this.modalOutputEl.scrollTop = this.modalOutputEl.scrollHeight;
        }
      }

      if (outputScrolledToBottom) {
        outputEl.scrollTop = outputEl.scrollHeight;
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
        inputField.focus({ preventScroll: true });
      });
    }

    if (inputField) {
      inputField.addEventListener('input', () => {
        const inputText = container.querySelector('#w-term-input-text');
        if (inputText) {
          inputText.textContent = inputField.value;
        }
      });

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
            if (outputEl) outputEl.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="w-term-cursor" class="cursor"></span>`;
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
    }
    this.syncHeight(container);
  },

  update(container, data) {
    // Note: ws-client streams console updates directly into registered subscribers
  },

  appendOutput(container, text) {
    const output = container.querySelector('#w-term-output');
    if (!output) return;

    // Remove cursor temp
    // Clean up current active prompt elements
    const oldInputText = output.querySelector('#w-term-input-text');
    if (oldInputText) oldInputText.remove();
    const oldCursor = output.querySelector('#w-term-cursor');
    if (oldCursor) oldCursor.remove();

    if (text === '__CLEAR__') {
      output.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="w-term-cursor" class="cursor"></span>`;
    } else {
      const formatted = ansiToHtml(text);
      output.innerHTML += `<br><span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="w-term-cursor" class="cursor"></span>`;
    }

    // Reset hidden input value
    const inputField = container.querySelector('#w-term-input');
    if (inputField) {
      inputField.value = '';
    }

    const threshold = 50; // pixels from bottom threshold to trigger auto-scroll
    const outputScrolledToBottom = (output.scrollHeight - output.scrollTop - output.clientHeight) <= threshold;

    if (this.modalActive && this.modalOutputEl) {
      const modalScrolledToBottom = (this.modalOutputEl.scrollHeight - this.modalOutputEl.scrollTop - this.modalOutputEl.clientHeight) <= threshold;

      // Clean up modal prompt elements
      const mInputText = this.modalOutputEl.querySelector('#m-term-input-text');
      if (mInputText) mInputText.remove();
      const mCursor = this.modalOutputEl.querySelector('#m-term-cursor');
      if (mCursor) mCursor.remove();

      if (text === '__CLEAR__') {
        this.modalOutputEl.innerHTML = '';
      } else {
        const formatted = text.replace(/\n/g, '<br>');
        this.modalOutputEl.innerHTML += `<br><span class="white-text">${formatted}</span><br><br><span class="cyan-text">root@homelab:~$</span> <span id="m-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="m-term-cursor" class="cursor"></span>`;
      }
      
      if (modalScrolledToBottom) {
        this.modalOutputEl.scrollTop = this.modalOutputEl.scrollHeight;
      }

      // Reset modal hidden input value
      const mInput = document.querySelector('#m-term-input');
      if (mInput) {
        mInput.value = '';
        mInput.focus({ preventScroll: true });
      }
    }

    if (outputScrolledToBottom) {
      output.scrollTop = output.scrollHeight;
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

  syncHeight(container) {
    setTimeout(() => {
      const ingressCard = document.querySelector('.grid-network-map');
      const terminalCard = container;
      if (ingressCard && terminalCard) {
        // Temporarily collapse terminalCard to measure ingress naturally without layout stretching
        terminalCard.style.height = '0px';
        terminalCard.style.overflow = 'hidden';

        const naturalHeight = ingressCard.offsetHeight;

        // Lock both containers to this exact natural height
        terminalCard.style.height = `${naturalHeight}px`;
        terminalCard.style.overflow = '';
        ingressCard.style.height = `${naturalHeight}px`;
      }
    }, 50);
  },

  openExpandModal(container) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay terminal-expand-modal';
    modal.style.zIndex = '20000';
    
    let currentLogs = container.querySelector('#w-term-output').innerHTML;
    // Replace small terminal IDs with modal IDs to avoid duplication
    currentLogs = currentLogs
      .replace('id="w-term-input-text"', 'id="m-term-input-text"')
      .replace('id="w-term-cursor"', 'id="m-term-cursor"');

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 1000px; width: 95%; height: 80vh; display: flex; flex-direction: column; background-color: var(--bg-panel); border: 1px solid var(--border-slate); border-radius: 8px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-slate);">
          <span style="font-weight: bold; text-transform: uppercase; font-size: 0.85rem; color: #fff;">Expanded Server Console Terminal</span>
          <button class="btn btn-close-modal" style="font-size: 1.5rem; background: transparent; border: none; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
        </div>
        <div class="modal-body" style="flex: 1; display: flex; flex-direction: column; background: var(--bg-shell); padding: 1rem; overflow: hidden; position: relative;">
          <div class="terminal-content" id="m-term-output" style="flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.45; white-space: pre-wrap; margin-bottom: 0.5rem; color: var(--text-primary);">${currentLogs}</div>
          <input type="text" id="m-term-input" style="opacity: 0; position: absolute; width: 0; height: 0; pointer-events: none;" autocomplete="off" />
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const modalOutput = modal.querySelector('#m-term-output');
    if (modalOutput) modalOutput.scrollTop = modalOutput.scrollHeight;
    
    const modalInput = modal.querySelector('#m-term-input');
    if (modalInput) {
      modalInput.focus({ preventScroll: true });
      
      modalInput.addEventListener('input', () => {
        const inputText = modal.querySelector('#m-term-input-text');
        if (inputText) {
          inputText.textContent = modalInput.value;
        }
      });

      modalInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const command = modalInput.value.trim();
          if (!command) return;
          modalInput.value = '';

          // Clear modal prompt text display immediately
          const inputText = modal.querySelector('#m-term-input-text');
          if (inputText) inputText.textContent = '';

          // If streaming logs, stop streaming on manual command execution
          if (this.activeLogsServiceId) {
            WsClient.unsubscribeLogs(this.activeLogsServiceId, this.logCallback);
            this.activeLogsServiceId = null;
            const hostLabel = container.querySelector('#w-term-host-label');
            if (hostLabel) hostLabel.textContent = `root@homelab-os`;
            
            // Clear screen of logs first to show fresh command
            const outputEl = container.querySelector('#w-term-output');
            if (outputEl) outputEl.innerHTML = `<span class="cyan-text">root@homelab:~$</span> <span id="w-term-input-text" style="color: var(--text-white); white-space: pre-wrap;"></span><span id="w-term-cursor" class="cursor"></span>`;
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
        modalInput.focus({ preventScroll: true });
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
