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
        this.renderLogin();
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

  renderLogin(errorMsg = '') {
    const isKeyAuth = this.config.sshAuthType === 'privateKey';
    
    let errorBanner = '';
    if (errorMsg) {
      errorBanner = `
        <div style="background: #ef4444; color: #ffffff; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #000000; padding: 0.75rem; font-family: var(--font-mono); font-size: 0.72rem; font-weight: bold; margin-bottom: 1.5rem; text-align: center; text-transform: uppercase;">
          [ERROR] ${errorMsg}
        </div>
      `;
    }
    
    this.container.innerHTML = `
      <div style="max-width: 480px; margin: 4rem auto; background: #000; border: 2px solid #fff; box-shadow: 6px 6px 0 #fff; padding: 2rem; font-family: var(--font-mono); border-radius: 0;">
        ${errorBanner}
        <h3 style="margin-top: 0; font-size: 0.85rem; font-weight: 900; text-transform: uppercase; color: #fff; border-bottom: 2px dashed #fff; padding-bottom: 0.75rem; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
          <span>SSH Host Authentication</span>
          <span style="font-size: 0.65rem; color: #a1a1aa;">${this.config.sshHost}:${this.config.sshPort}</span>
        </h3>
        <p style="font-size: 0.68rem; color: #a1a1aa; line-height: 1.4; margin-bottom: 1.5rem; background: #0e0e11; border: 1px dashed #33333e; padding: 0.5rem;">
          <b>Security Policy</b>: Login credentials are kept strictly in-memory inside the browser and connection socket. They are never saved to the database or written to server logs.
        </p>
        
        <form id="term-login-form">
          <div class="form-group" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.35rem;">
            <label style="font-size: 0.65rem; color: #fff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">SSH Username</label>
            <div style="background: #0e0e11; border: 1px solid #33333e; color: #fff; padding: 0.5rem; font-family: var(--font-mono); font-size: 0.75rem; border-radius: 0; box-sizing: border-box;">${this.config.sshUser}</div>
          </div>
          
          <div class="form-group" style="margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
            <label style="font-size: 0.65rem; color: #fff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
              ${isKeyAuth ? 'SSH Private Key' : 'SSH Password'}
            </label>
            ${isKeyAuth 
              ? `<textarea id="term-ssh-secret" rows="6" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\\n..." required style="background: #0e0e11; border: 1px solid #fff; color: #fff; padding: 0.5rem; width: 100%; font-family: var(--font-mono); font-size: 0.72rem; border-radius: 0; box-sizing: border-box; resize: vertical;"></textarea>`
              : `<input type="password" id="term-ssh-secret" placeholder="Enter password" required style="background: #0e0e11; border: 1px solid #fff; color: #fff; padding: 0.5rem; width: 100%; font-family: var(--font-mono); font-size: 0.75rem; border-radius: 0; box-sizing: border-box;" autocomplete="current-password">`
            }
          </div>
          
          <button type="submit" class="btn btn-panel btn-open" id="btn-establish-ssh" style="width: 100%; background: #fff; color: #000; font-weight: 900; text-transform: uppercase; padding: 0.75rem; border: 2px solid #fff; box-shadow: 3px 3px 0 #888888; font-size: 0.75rem; cursor: pointer;">Connect to Server</button>
        </form>
      </div>
    `;

    const form = this.container.querySelector('#term-login-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = this.config.sshUser;
      const secret = this.container.querySelector('#term-ssh-secret').value.trim();
      if (username && secret) {
        this.renderTerminalFrame(username, secret);
      }
    });
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

    // Open socket bridge
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('homelab_token') || '';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    const statusDot = this.container.querySelector('#ssh-status-dot');
    const statusText = this.container.querySelector('#ssh-status-text');

    this.ws.onopen = () => {
      this.term.write('\r\n\x1b[33m*** WebSocket Socket Connected. Sending SSH Handshake Payload... ***\x1b[0m\r\n');
      
      // Dispatch in-memory credentials immediately upon socket connection open
      this.ws.send(JSON.stringify({
        type: 'auth',
        username: username,
        secret: secret
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
            if (statusDot) statusDot.style.background = '#ef4444';
            if (statusText) statusText.textContent = 'Auth Failed';
            
            if (!this.isRedirecting) {
              this.isRedirecting = true;
              setTimeout(() => {
                this.destroy();
                this.renderLogin(`Authentication Failed: ${payload.message}`);
              }, 2500);
            }
            return;
          }
        } catch {}
      }
      
      // Update UI state to green on first output response from SSH stream
      if (!this.sessionActive) {
        this.sessionActive = true;
        if (statusDot) statusDot.style.background = '#22c55e';
        if (statusText) statusText.textContent = `${username}@${this.config.sshHost}`;
        
        // Trigger resize once the shell is active to synchronize dimensions
        setTimeout(() => this.resizeTerminal(), 150);
      }

      this.writeBuffer.push(event.data);
      if (!this.writeAnimationFrame) {
        this.writeAnimationFrame = requestAnimationFrame(flushWriteBuffer);
      }
    };

    this.ws.onclose = () => {
      this.term.write('\r\n\x1b[31m*** SSH Shell Gateway Connection Terminated. ***\x1b[0m\r\n');
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.textContent = 'Disconnected';
      
      if (!this.sessionActive && !this.isRedirecting) {
        this.isRedirecting = true;
        setTimeout(() => {
          this.destroy();
          this.renderLogin('SSH Connection Closed: Authentication failed or connection refused.');
        }, 2500);
      }
    };

    this.ws.onerror = (err) => {
      this.term.write(`\r\n\x1b[31m*** Socket connection error: ${err.message || 'Unknown network failure'} ***\x1b[0m\r\n`);
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.textContent = 'Error';
      
      if (!this.sessionActive && !this.isRedirecting) {
        this.isRedirecting = true;
        setTimeout(() => {
          this.destroy();
          this.renderLogin('SSH Socket Error: Unable to establish connection to server.');
        }, 2500);
      }
    };

    // Forward raw typed terminal characters to host shell
    this.term.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'data', data: data }));
      }
    });

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
  }
};

export default AppTerminal;
