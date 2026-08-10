// Terminal Application - WebSocket xterm.js interactive SSH console
import { api } from '../core/api.js';

export const AppTerminal = {
  container: null,
  term: null,
  fitAddon: null,
  ws: null,
  resizeHandler: null,

  init(containerEl) {
    this.container = containerEl;
    this.destroy(); // Teardown any leftover instances
    this.render();
    this.initTerminal();
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: none !important; padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; font-family: var(--font-mono);">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">Direct Host SSH Terminal Console</span>
        <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold; display: flex; align-items: center; gap: 0.5rem;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e;" id="ssh-status-dot"></span>
          SSH Gateway Session
        </span>
      </div>
      <div class="terminal-body" style="background-color: #0e0e11; border: 1px solid var(--border-slate); border-radius: 6px; padding: 0.75rem; height: calc(100vh - 200px); margin-top: 1rem; box-sizing: border-box; overflow: hidden; position: relative;">
        <div id="xterm-container" style="height: 100%; width: 100%;"></div>
      </div>
    `;
  },

  initTerminal() {
    const xtermBox = this.container.querySelector('#xterm-container');
    if (!xtermBox) return;

    // Check if xterm.js CDN loaded correctly
    if (typeof Terminal === 'undefined') {
      xtermBox.innerHTML = `<span style="color: var(--border-focus); font-family: var(--font-mono); font-size: 0.8rem;">Error: Failed to load xterm.js library from CDN. Check your internet connection.</span>`;
      return;
    }

    // Initialize xterm Terminal instance
    this.term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: '#0e0e11',
        foreground: '#ffffff',
        cursor: '#22c55e',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#ffffff',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);

    // Open terminal canvas
    this.term.open(xtermBox);
    this.fitAddon.fit();

    // Setup WebSockets
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('token') || '';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    const statusDot = this.container.querySelector('#ssh-status-dot');

    this.ws.onopen = () => {
      this.term.write('\r\n\x1b[32m*** WebSocket Connection Established. Authenticating SSH Shell Session... ***\x1b[0m\r\n\r\n');
      if (statusDot) statusDot.style.background = '#22c55e';
      
      // Request initial terminal dimensions
      setTimeout(() => this.resizeTerminal(), 300);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'error') {
          this.term.write(`\r\n\x1b[31mError: ${payload.message}\x1b[0m\r\n`);
          if (statusDot) statusDot.style.background = '#ef4444';
          return;
        }
      } catch {}
      
      // Render terminal streams to xterm
      this.term.write(event.data);
    };

    this.ws.onclose = () => {
      this.term.write('\r\n\x1b[31m*** SSH Shell Connection Terminated. ***\x1b[0m\r\n');
      if (statusDot) statusDot.style.background = '#ef4444';
    };

    this.ws.onerror = (err) => {
      this.term.write(`\r\n\x1b[31m*** Socket connection error: ${err.message || 'Unknown network error'} ***\x1b[0m\r\n`);
      if (statusDot) statusDot.style.background = '#ef4444';
    };

    // Forward raw key codes to host terminal stream
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
      console.warn('Terminal resize execution failed:', err);
    }
  },

  destroy() {
    // Tear down window event listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    // Dispose terminal canvas elements
    if (this.term) {
      try {
        this.term.dispose();
      } catch {}
      this.term = null;
    }
    
    this.fitAddon = null;
  }
};

export default AppTerminal;
