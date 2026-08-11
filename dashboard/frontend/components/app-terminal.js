// Terminal Application - WebSocket xterm.js interactive SSH console (Dynamic In-Memory Auth)
import { api } from '../core/api.js';

export const AppTerminal = {
  container: null,
  term: null,
  fitAddon: null,
  ws: null,
  resizeHandler: null,
  config: null,
  sessionActive: false,
  isRedirecting: false,
  lastCols: null,
  lastRows: null,
  resizeTimeout: null,
  writeBuffer: [],
  writeAnimationFrame: null,
  isAuthInputActive: false,
  authBuffer: '',

  async init(containerEl) {
    this.container = containerEl;
    this.destroy(); // Clean up existing sockets/terminal instances
    
    this.container.innerHTML = `<div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); padding: 2rem; text-align: center;">Querying terminal connection status...</div>`;
    
    try {
      this.config = await api.get('/api/v1/settings/ssh');
      const isLocal = this.config && this.config.sshHost === 'local';
      if (!this.config || !this.config.sshHost || (!isLocal && !this.config.sshUser)) {
        this.renderConfigureNotice();
      } else if (isLocal) {
        this.renderTerminalFrame('local', 'local');
      } else {
        this.renderTerminalFrame(this.config.sshUser, null);
      }
    } catch (err) {
      this.container.innerHTML = `<div style="font-family: var(--font-mono); font-size: 0.8rem; color: #ef4444; padding: 2rem;">Error: Failed to fetch SSH terminal configuration settings.</div>`;
    }
  },

  renderConfigureNotice() {
    this.container.innerHTML = `
      <div style="max-width: 480px; margin: 4rem auto; background: #000; border: 2px solid #ef4444; box-shadow: 6px 6px 0 #ef4444; padding: 2rem; font-family: var(--font-mono); text-align: center;">
        <h3 style="margin-top: 0; font-size: 0.95rem; font-weight: 900; text-transform: uppercase; color: #ef4444; border-bottom: 2px dashed #ef4444; padding-bottom: 0.75rem;">SSH Settings Missing</h3>
        <p style="font-size: 0.72rem; color: #a1a1aa; line-height: 1.5; margin-bottom: 1.5rem;">Host connection details or SSH Username have not been configured yet. Please configure the SSH connection settings before launching the console.</p>
        <button class="btn btn-panel btn-open" id="btn-go-to-settings" style="background: #ef4444; color: #fff; border: 2px solid #ef4444; font-weight: 900; text-transform: uppercase; padding: 0.6rem 1.2rem; cursor: pointer;">Go to Settings</button>
      </div>
    `;

    const btn = this.container.querySelector('#btn-go-to-settings');
    if (btn) {
      btn.addEventListener('click', () => {
        const settingsNav = document.getElementById('sidebar-nav-menu')?.querySelector('[data-app-id="settings"]');
        if (settingsNav) {
          settingsNav.click();
        }
      });
    }
  },


  renderTerminalFrame(username, secret) {
    const savedConfig = this.config;
    this.destroy();
    this.config = savedConfig;

    this.container.innerHTML = `
      <div style="width: 100%; height: 100%; display: flex; flex-direction: column; background-color: #000000; overflow: hidden;">
        <!-- Minimal title bar with connection status -->
        <div style="background: #000000; color: #888888; padding: 0.5rem 1rem; font-family: var(--font-mono); font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222222; user-select: none;">
          <div style="display: flex; align-items: center; gap: 0.45rem; font-weight: bold;">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #888888;">
              <polyline points="4 12 9 8 4 4"></polyline>
              <line x1="9" y1="12" x2="14" y2="12"></line>
            </svg>
            <span>CONSOLE SESSION: ${username}@${this.config.sshHost}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem; font-weight: bold; text-transform: uppercase;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #eab308; transition: all 0.2s;" id="ssh-status-dot"></span>
            <span id="ssh-status-text">Connecting...</span>
          </div>
        </div>
        <!-- Terminal Canvas Container -->
        <div class="terminal-body" style="background-color: #000000; flex: 1; padding: 0.75rem; box-sizing: border-box; overflow: hidden;">
          <div id="xterm-container" style="height: 100%; width: 100%;"></div>
        </div>
      </div>
    `;

    this.initTerminal(username, secret);
  },

  initTerminal(username, secret) {
    const xtermBox = this.container.querySelector('#xterm-container');
    if (!xtermBox) return;

    if (typeof Terminal === 'undefined') {
      xtermBox.innerHTML = `<span style="color: var(--border-focus); font-family: var(--font-mono); font-size: 0.8rem;">Error: Failed to load xterm.js library from CDN. Check your network configuration.</span>`;
      return;
    }

    // Allocate xterm terminal emulator instance
    this.term = new Terminal({
      cursorBlink: true,
      copyOnSelection: true,
      fontFamily: 'Consolas, "Cascadia Code", "Courier New", Courier, monospace',
      fontSize: 13,
      lineHeight: 1.0,
      scrollback: 3000,
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        black: '#0c0c0c',
        red: '#c50f1f',
        green: '#13a10e',
        yellow: '#c19c00',
        blue: '#0037da',
        magenta: '#881798',
        cyan: '#3a96dd',
        white: '#cccccc',
        brightBlack: '#767676',
        brightRed: '#e74856',
        brightGreen: '#16c60c',
        brightYellow: '#f9f1a5',
        brightBlue: '#3b78ff',
        brightMagenta: '#b4009e',
        brightCyan: '#61d6d6',
        brightWhite: '#f2f2f2'
      }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);

    // Open terminal canvas
    this.term.open(xtermBox);
    this.fitAddon.fit();

    const statusDot = this.container.querySelector('#ssh-status-dot');
    const statusText = this.container.querySelector('#ssh-status-text');

    const promptForReconnect = () => {
      if (this.isAuthInputActive) return;
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        try { this.ws.close(); } catch {}
        this.ws = null;
      }
      this.sessionActive = false;
      this.isRedirecting = false;

      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.textContent = 'Awaiting Auth';

      const isKeyAuth = this.config && this.config.sshAuthType === 'privateKey';
      this.term.write(`\r\n\x1b[1;33mPlease re-enter credentials to reconnect.\x1b[0m\r\n`);
      this.term.write(`${isKeyAuth ? 'SSH Private Key' : 'Password'}: `);
      
      this.isAuthInputActive = true;
      this.authBuffer = '';
    };

    const connect = (enteredSecret) => {
      if (statusDot) statusDot.style.background = '#eab308';
      if (statusText) statusText.textContent = 'Connecting...';

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('homelab_token') || '';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.term.write('\r\n\x1b[33m*** WebSocket Socket Connected. Sending Handshake... ***\x1b[0m\r\n');
        this.ws.send(JSON.stringify({
          type: 'auth',
          username: username,
          secret: enteredSecret
        }));
      };

      this.writeBuffer = [];
      this.writeAnimationFrame = null;

      const flushWriteBuffer = () => {
        if (this.writeBuffer.length > 0 && this.term) {
          this.term.write(this.writeBuffer.join(''));
          this.writeBuffer = [];
        }
        this.writeAnimationFrame = null;
      };

      this.ws.onmessage = (event) => {
        const rawData = event.data;
        if (typeof rawData === 'string' && rawData.startsWith('{')) {
          try {
            const payload = JSON.parse(rawData);
            if (payload.type === 'error') {
              this.term.write(`\r\n\x1b[31mError: ${payload.message}\x1b[0m\r\n`);
              promptForReconnect();
              return;
            }
          } catch {}
        }
        
        if (!this.sessionActive) {
          this.sessionActive = true;
          if (statusDot) statusDot.style.background = '#22c55e';
          if (statusText) statusText.textContent = `${username}@${this.config.sshHost}`;
          setTimeout(() => this.resizeTerminal(), 150);
        }

        this.writeBuffer.push(event.data);
        if (!this.writeAnimationFrame) {
          this.writeAnimationFrame = requestAnimationFrame(flushWriteBuffer);
        }
      };

      this.ws.onclose = () => {
        this.term.write('\r\n\x1b[31m*** SSH Shell Gateway Connection Terminated. ***\x1b[0m\r\n');
        promptForReconnect();
      };

      this.ws.onerror = (err) => {
        this.term.write(`\r\n\x1b[31m*** Socket connection error: ${err.message || 'Unknown failure'} ***\x1b[0m\r\n`);
        promptForReconnect();
      };
    };

    // Forward raw typed terminal characters or capture authentication input
    this.term.onData((data) => {
      if (this.isAuthInputActive) {
        const isKeyAuth = this.config && this.config.sshAuthType === 'privateKey';
        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          if (char === '\r' || char === '\n') {
            this.isAuthInputActive = false;
            this.term.write('\r\n');
            const enteredSecret = this.authBuffer;
            this.authBuffer = '';
            
            this.term.write('\x1b[33m*** Establishing connection... ***\x1b[0m\r\n');
            connect(enteredSecret);
            break;
          } else if (char === '\x7f' || char === '\b') {
            if (this.authBuffer.length > 0) {
              this.authBuffer = this.authBuffer.slice(0, -1);
              this.term.write('\b \b');
            }
          } else {
            this.authBuffer += char;
            if (isKeyAuth) {
              this.term.write(char);
            } else {
              this.term.write('*');
            }
          }
        }
      } else {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'data', data: data }));
        }
      }
    });

    // Check if initial authentication is required
    if (secret === null) {
      if (statusDot) statusDot.style.background = '#eab308';
      if (statusText) statusText.textContent = 'Awaiting Auth';

      const isKeyAuth = this.config && this.config.sshAuthType === 'privateKey';
      this.term.write(`\r\n\x1b[1;36mHomeLab OS Console Gateway\x1b[0m\r\n`);
      this.term.write(`Connecting to: ${username}@${this.config.sshHost}:${this.config.sshPort}\r\n\r\n`);
      this.term.write(`${isKeyAuth ? 'SSH Private Key' : 'Password'}: `);

      this.isAuthInputActive = true;
      this.authBuffer = '';
    } else {
      connect(secret);
    }

    // Throttled container resizing (runs at most once every 100ms)
    this.resizeHandler = () => {
      if (this.resizeTimeout) return;
      this.resizeTimeout = setTimeout(() => {
        this.resizeTerminal();
        this.resizeTimeout = null;
      }, 100);
    };
    window.addEventListener('resize', this.resizeHandler);

    // Initial resize trigger
    setTimeout(() => this.resizeTerminal(), 100);
  },

  resizeTerminal() {
    if (!this.term || !this.fitAddon || !this.container.querySelector('#xterm-container')) return;
    try {
      this.fitAddon.fit();
      const cols = this.term.cols;
      const rows = this.term.rows;

      // Abort if dimensions haven't actually changed
      if (this.lastCols === cols && this.lastRows === rows) {
        return;
      }

      this.lastCols = cols;
      this.lastRows = rows;

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'resize',
          cols: cols,
          rows: rows
        }));
      }
    } catch (err) {
      console.warn('Terminal resizing request failed:', err);
    }
  },

  destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    if (this.term) {
      try {
        this.term.dispose();
      } catch {}
      this.term = null;
    }
    
    if (this.writeAnimationFrame) {
      cancelAnimationFrame(this.writeAnimationFrame);
      this.writeAnimationFrame = null;
    }
    this.writeBuffer = [];

    this.fitAddon = null;
    this.sessionActive = false;
    this.isRedirecting = false;
    this.lastCols = null;
    this.lastRows = null;
    this.isAuthInputActive = false;
    this.authBuffer = '';
  }
};

export default AppTerminal;
