// Terminal Application - Full screen console shell wrapper
import { api } from '../core/api.js';

export const AppTerminal = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">Direct System Terminal Console</span>
        <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">host@homelab-os:~</span>
      </div>
      <div class="terminal-body" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 6px; padding: 1.25rem; font-family: var(--font-mono); font-size: 0.8rem; height: calc(100vh - 200px); overflow-y: auto; line-height: 1.5; margin-top: 1rem;">
        <div class="terminal-content" id="app-term-output">
          <span class="cyan-text">host@homelab-os:~$</span> Control console session active. Type 'help' for valid shell commands.<br><br>
          <span class="cyan-text">host@homelab-os:~$</span> <span id="app-term-cursor" class="cursor"></span>
        </div>
      </div>
      <div style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: center;">
        <span class="prompt-symbol" style="font-family: var(--font-mono); color: var(--border-focus); font-weight: bold;">$</span>
        <input type="text" placeholder="Type host command here (e.g. docker stats, df -h, uptime)..." id="app-term-input-field" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; color: var(--text-primary); font-family: var(--font-mono); font-size: 0.8rem; width: 100%;" autocomplete="off">
      </div>
    `;

    const inputField = this.container.querySelector('#app-term-input-field');
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = inputField.value.trim();
        if (cmd) {
          this.executeCommand(cmd);
          inputField.value = '';
        }
      }
    });

    // Auto-focus input
    setTimeout(() => inputField.focus(), 50);
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  async executeCommand(cmd) {
    const outputEl = this.container.querySelector('#app-term-output');
    if (!outputEl) return;

    // Remove cursor temp
    const cursor = outputEl.querySelector('#app-term-cursor');
    if (cursor) cursor.remove();

    outputEl.innerHTML += `<br><span class="cyan-text">host@homelab-os:~$</span> <span class="white-text">${this.escapeHtml(cmd)}</span>`;

    if (cmd === 'clear') {
      outputEl.innerHTML = `<span class="cyan-text">host@homelab-os:~$</span> <span id="app-term-cursor" class="cursor"></span>`;
      return;
    }

    try {
      const res = await api.post('/api/v1/terminal', { command: cmd });
      const formatted = this.escapeHtml(res.output).replace(/\n/g, '<br>');
      outputEl.innerHTML += `<br><span class="white-text">${formatted}</span>`;
    } catch (err) {
      outputEl.innerHTML += `<br><span style="color: var(--border-focus);">bash error: ${this.escapeHtml(err.message)}</span>`;
    }

    outputEl.innerHTML += `<br><br><span class="cyan-text">host@homelab-os:~$</span> <span id="app-term-cursor" class="cursor"></span>`;

    // Scroll to bottom
    const body = this.container.querySelector('.terminal-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }
};

export default AppTerminal;
