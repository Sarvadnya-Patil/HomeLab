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

  renderLogin() {
    const isKeyAuth = this.config.sshAuthType === 'privateKey';
    
    this.container.innerHTML = `
      <div style="max-width: 480px; margin: 4rem auto; background: #000; border: 2px solid #fff; box-shadow: 6px 6px 0 #fff; padding: 2rem; font-family: var(--font-mono); border-radius: 0;">
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
    this.container.innerHTML = `
      <div style="width: 100vw; height: 100vh; background-color: #000000; overflow: hidden; position: relative; display: flex; flex-direction: column; box-sizing: border-box;">
        <!-- Subtle connection status indicator at the top center -->
        <div style="position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 9999; font-family: var(--font-mono); font-size: 0.65rem; color: #555555; background: rgba(0, 0, 0, 0.6); padding: 0.25rem 0.55rem; border-radius: 3px; display: flex; align-items: center; gap: 0.35rem; pointer-events: none; border: 1px solid rgba(255, 255, 255, 0.05); text-transform: uppercase;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #eab308; transition: all 0.2s;" id="ssh-status-dot"></span>
          <span id="ssh-status-text">Connecting...</span>
        </div>
        <!-- Transparent floating exit button in top-right corner to navigate back -->
        <button onclick="document.getElementById('sidebar-nav-menu')?.querySelector('[data-app-id=dashboard]')?.click()" 
                style="position: absolute; top: 12px; right: 25px; z-index: 9999; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.6); font-family: var(--font-mono); font-size: 0.72rem; padding: 0.3rem 0.6rem; cursor: pointer; border-radius: 4px; transition: all 0.15s; outline: none; display: flex; align-items: center; gap: 0.3rem; font-weight: bold;"
                onmouseover="this.style.background='rgba(239, 68, 68, 0.8)'; this.style.color='#ffffff'; this.style.borderColor='transparent';"
                onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.color='rgba(255, 255, 255, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)';"
                title="Exit Terminal">
          ✕ Exit
        </button>
        <!-- Terminal Canvas Container -->
        <div class="terminal-body" style="background-color: #000000; flex: 1; padding: 0.75rem; box-sizing: border-box; overflow: hidden; position: relative;">
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
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        black: '#000000',
        red: '#cd0000',
        green: '#00cd00',
        yellow: '#cdcd00',
        blue: '#0000ee',
        magenta: '#cd00cd',
        cyan: '#00cdcd',
        white: '#e5e5e5',
        brightBlack: '#7f7f7f',
        brightRed: '#ff0000',
        brightGreen: '#00ff00',
        brightYellow: '#ffff00',
        brightBlue: '#5c5cff',
        brightMagenta: '#ff00ff',
        brightCyan: '#00ffff',
        brightWhite: '#ffffff'
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

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'error') {
          this.term.write(`\r\n\x1b[31mError: ${payload.message}\x1b[0m\r\n`);
          if (statusDot) statusDot.style.background = '#ef4444';
          if (statusText) statusText.textContent = 'Auth Failed';
          return;
        }
      } catch {}
      
      // Update UI state to green on first output response from SSH stream
      if (!this.sessionActive) {
        this.sessionActive = true;
        if (statusDot) statusDot.style.background = '#22c55e';
        if (statusText) statusText.textContent = `${username}@${this.config.sshHost}`;
        
        // Trigger resize once the shell is active to synchronize dimensions
        setTimeout(() => this.resizeTerminal(), 150);
      }

      this.term.write(event.data);
    };

    this.ws.onclose = () => {
      this.term.write('\r\n\x1b[31m*** SSH Shell Gateway Connection Terminated. ***\x1b[0m\r\n');
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.textContent = 'Disconnected';
    };

    this.ws.onerror = (err) => {
      this.term.write(`\r\n\x1b[31m*** Socket connection error: ${err.message || 'Unknown network failure'} ***\x1b[0m\r\n`);
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.textContent = 'Error';
    };

    // Forward raw typed terminal characters to host shell
    this.term.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'data', data: data }));
      }
    });

    // Handle container resizing
    this.resizeHandler = () => this.resizeTerminal();
    window.addEventListener('resize', this.resizeHandler);

    // Initial resize trigger
    setTimeout(() => this.resizeTerminal(), 100);
  },

  resizeTerminal() {
    if (!this.term || !this.fitAddon || !this.container.querySelector('#xterm-container')) return;
    try {
      this.fitAddon.fit();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'resize',
          cols: this.term.cols,
          rows: this.term.rows
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
    
    this.fitAddon = null;
    this.config = null;
    this.sessionActive = false;
  }
};

export default AppTerminal;
