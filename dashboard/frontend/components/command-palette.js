// VS Code style Command Palette (Ctrl+K search utility overlay)
import { store } from '../core/state.js';
import { api } from '../core/api.js';

export const CommandPalette = {
  el: null,
  input: null,
  resultsList: null,
  selectedIndex: -1,

  init() {
    this.createDom();
    
    // Listen to open toggle state changes
    store.on('commandPaletteOpen', ({ value }) => {
      if (value) this.open();
      else this.close();
    });

    // Handle global clicks or Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && store.get('commandPaletteOpen')) {
        store.set('commandPaletteOpen', false);
      }
    });

    // Also support standard search bar input filtering as fallback mapping
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      mainSearchBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = mainSearchBar.value.trim();
          if (val) {
            // Trigger console command executing
            store.emit('terminal_run_command', val);
            mainSearchBar.value = '';
          }
        }
      });
    }
  },

  createDom() {
    if (document.getElementById('cmd-palette-modal')) return;

    this.el = document.createElement('div');
    this.el.id = 'cmd-palette-modal';
    this.el.className = 'modal-overlay';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="modal-box cmd-palette-box">
        <div class="cmd-palette-input-row">
          <span class="prompt-symbol">&gt;</span>
          <input type="text" placeholder="Type a service, category, workspace, command, settings..." id="cmd-palette-input" autocomplete="off">
        </div>
        <div class="cmd-palette-results" id="cmd-palette-results-list">
          <!-- Results populated here -->
        </div>
      </div>
    `;

    document.body.appendChild(this.el);

    this.input = this.el.querySelector('#cmd-palette-input');
    this.resultsList = this.el.querySelector('#cmd-palette-results-list');

    // Input keyboard navigation
    this.input.addEventListener('input', () => this.querySearch());
    this.input.addEventListener('keydown', (e) => this.handleNavigation(e));

    // Overlay click closes
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) {
        store.set('commandPaletteOpen', false);
      }
    });
  },

  open() {
    if (!this.el) return;
    this.el.style.display = 'flex';
    this.input.value = '';
    this.resultsList.innerHTML = '';
    this.selectedIndex = -1;
    setTimeout(() => this.input.focus(), 50);
  },

  close() {
    if (!this.el) return;
    this.el.style.display = 'none';
    this.input.blur();
  },

  async querySearch() {
    const q = this.input.value.trim();
    if (!q) {
      this.resultsList.innerHTML = '';
      this.selectedIndex = -1;
      return;
    }

    try {
      const results = await api.get(`/api/v1/search?q=${encodeURIComponent(q)}`);
      this.renderResults(results);
    } catch (err) {
      console.error('Palette search failed:', err);
    }
  },

  renderResults(results) {
    this.resultsList.innerHTML = '';
    this.selectedIndex = -1;

    if (results.length === 0) {
      this.resultsList.innerHTML = `<div class="palette-empty-state">No matching services, settings, or workspace channels.</div>`;
      return;
    }

    results.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'palette-item-row';
      row.setAttribute('data-index', idx);
      row.setAttribute('data-action', item.action);
      
      row.innerHTML = `
        <div class="palette-item-main">
          <span class="palette-item-title">${item.title}</span>
          <span class="palette-item-sub">${item.subtitle}</span>
        </div>
        <span class="palette-item-badge">${item.type.toUpperCase()}</span>
      `;

      row.addEventListener('click', () => this.triggerAction(item.action));
      this.resultsList.appendChild(row);
    });
  },

  handleNavigation(e) {
    const rows = this.resultsList.querySelectorAll('.palette-item-row');
    if (rows.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % rows.length;
      this.highlightRow(rows);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + rows.length) % rows.length;
      this.highlightRow(rows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selectedIndex >= 0 && this.selectedIndex < rows.length) {
        const action = rows[this.selectedIndex].getAttribute('data-action');
        this.triggerAction(action);
      }
    }
  },

  highlightRow(rows) {
    rows.forEach((row, idx) => {
      if (idx === this.selectedIndex) {
        row.classList.add('selected');
        row.scrollIntoView({ block: 'nearest' });
      } else {
        row.classList.remove('selected');
      }
    });
  },

  async triggerAction(action) {
    if (!action) return;
    store.set('commandPaletteOpen', false);

    console.log(`CommandPalette triggering keyroute action: ${action}`);

    if (action.startsWith('navigate-workspace:')) {
      const wsId = action.split(':')[1];
      store.set('activeWorkspace', wsId);
      store.set('activeApp', 'dashboard');
    } else if (action.startsWith('open-service:')) {
      const serviceId = action.split(':')[1];
      store.set('activeApp', 'dashboard');
      setTimeout(() => store.emit('ui_focus_service', serviceId), 100);
    } else if (action.startsWith('focus-category:')) {
      const catId = action.split(':')[1];
      store.set('activeApp', 'dashboard');
      setTimeout(() => store.emit('ui_focus_category', catId), 100);
    } else if (action === 'open-settings') {
      store.set('activeApp', 'settings');
    } else if (action === 'open-terminal') {
      store.set('activeApp', 'terminal');
    } else if (action === 'open-health') {
      store.set('activeApp', 'health');
    } else if (action === 'open-jobs') {
      store.set('activeApp', 'jobs');
    } else if (action === 'open-designer') {
      store.set('activeApp', 'designer');
    } else if (action.startsWith('execute-command:')) {
      const cmdPath = action.replace('execute-command:', '');
      if (cmdPath.startsWith('run-command:service:')) {
        const parts = cmdPath.split(':');
        const serviceId = parts[2];
        const actionType = parts[3];
        try {
          const res = await api.post(`/api/v1/services/${serviceId}/action`, { action: actionType });
          alert(`Command executed. Background Job ID: ${res.jobId}. Monitor status in the Job Center.`);
        } catch (err) {
          alert(`Command execution failed: ${err.message}`);
        }
      }
    }
  }
};

export default CommandPalette;
