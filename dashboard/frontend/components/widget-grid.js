// Adaptive Widget Grid component
import { store } from '../core/state.js';
import { api } from '../core/api.js';
import { getWidget } from '../widgets/registry.js';
import { WsClient } from '../core/ws-client.js';

export const WidgetGrid = {
  container: null,
  activeWorkspaceId: null,
  activeWidgets: [], // Array of { id, widgetObj, wrapperEl }

  init(containerEl) {
    this.container = containerEl;
    this.activeWorkspaceId = store.get('activeWorkspace') || 'overview';
    
    // Rerender grid whenever active workspace changes
    store.on('activeWorkspace', ({ value }) => {
      this.activeWorkspaceId = value;
      this.loadWorkspaceLayout();
    });

    // Listen to metrics and update matching active widget modules
    store.on('metrics', ({ value }) => {
      this.activeWidgets.forEach(item => {
        if (item.widgetObj.wsEvents.includes('metrics')) {
          item.widgetObj.update(item.wrapperEl, value);
        }
      });
    });

    // Listen to services and update matching widget modules
    store.on('services', ({ value }) => {
      this.activeWidgets.forEach(item => {
        if (item.widgetObj.wsEvents.includes('services')) {
          item.widgetObj.update(item.wrapperEl, value);
        }
      });
    });

    // Listen to notifications events and update events widget modules
    store.on('notifications', ({ value }) => {
      this.activeWidgets.forEach(item => {
        if (item.widgetObj.wsEvents.includes('events')) {
          item.widgetObj.update(item.wrapperEl, value);
        }
      });
    });

    // Listen to categories and update matching widget modules
    store.on('categories', ({ value }) => {
      this.activeWidgets.forEach(item => {
        if (item.widgetObj.wsEvents.includes('categories')) {
          item.widgetObj.update(item.wrapperEl, value);
        }
      });
    });

    // Intercept logs focus requests
    store.on('ui_logs_focus', ({ value }) => {
      const termWidget = this.activeWidgets.find(w => w.id === 'w-terminal' || w.widgetObj.id === 'terminal');
      if (termWidget) {
        termWidget.wrapperEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        termWidget.widgetObj.startLogsStream(termWidget.wrapperEl, value);
      }
    });

    // Intercept direct command execution inputs
    store.on('terminal_run_command', ({ value }) => {
      const termWidget = this.activeWidgets.find(w => w.id === 'w-terminal' || w.widgetObj.id === 'terminal');
      if (termWidget) {
        termWidget.widgetObj.appendOutput(termWidget.wrapperEl, `Running: ${value}...`);
        
        // Execute REST cmd execute
        api.post('/api/v1/terminal', { command: value })
          .then(res => {
            termWidget.widgetObj.appendOutput(termWidget.wrapperEl, res.output);
          })
          .catch(err => {
            termWidget.widgetObj.appendOutput(termWidget.wrapperEl, `bash error: ${err.message}`);
          });
      }
    });
  },

  async loadWorkspaceLayout() {
    if (!this.container || !this.activeWorkspaceId) return;

    // Cleanup previous widgets
    this.activeWidgets.forEach(item => {
      if (item.widgetObj.destroy) item.widgetObj.destroy(item.wrapperEl);
    });
    this.activeWidgets = [];
    this.container.innerHTML = '<div style="color: var(--text-muted); padding: 2rem;">Loading workspace widgets layout...</div>';

    try {
      const widgets = await api.get(`/api/v1/workspaces/${this.activeWorkspaceId}/widgets`);
      
      this.container.innerHTML = '';
      
      // Sort widgets by displayOrder
      const sorted = [...widgets].sort((a, b) => a.displayOrder - b.displayOrder);

      let statsRow = null;

      sorted.forEach(w => {
        if (!w.visible) return;

        const widgetObj = getWidget(w.type);
        if (!widgetObj) {
          console.warn(`Widget type not registered in catalog: ${w.type}`);
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'widget-wrapper';
        wrapper.setAttribute('data-widget-id', w.id);
        wrapper.setAttribute('data-size', w.size);
        wrapper.setAttribute('draggable', 'true');
        
        // Render widget markup
        widgetObj.render(wrapper);

        const isResource = ['cpu', 'ram', 'gpu', 'disk'].includes(w.type);
        if (isResource) {
          if (!statsRow) {
            statsRow = document.createElement('div');
            statsRow.className = 'resource-stats-row';
            this.container.appendChild(statsRow);
          }
          statsRow.appendChild(wrapper);
        } else {
          this.container.appendChild(wrapper);
        }

        // Map initial state updates
        if (widgetObj.wsEvents.includes('metrics')) {
          widgetObj.update(wrapper, store.get('metrics'));
        }
        if (widgetObj.wsEvents.includes('services')) {
          widgetObj.update(wrapper, store.get('services'));
        }
        if (widgetObj.wsEvents.includes('events')) {
          widgetObj.update(wrapper, store.get('notifications'));
        }

        this.activeWidgets.push({
          id: w.id,
          widgetObj,
          wrapperEl: wrapper
        });
      });

      this.bindDragReorder();

      // Compile active widget events subscriptions
      const events = new Set(['events', 'alert']); // Always subscribe to alerts
      this.activeWidgets.forEach(item => {
        if (item.widgetObj.wsEvents) {
          item.widgetObj.wsEvents.forEach(e => events.add(e));
        }
      });
      WsClient.send({ type: 'subscribe', events: Array.from(events) });

    } catch (err) {
      this.container.innerHTML = `<div style="color: var(--term-amber); padding: 2rem;">Failed to load widgets: ${err.message}</div>`;
    }
  },

  // Implement HTML5 drag and drop layout reorder persistence
  bindDragReorder() {
    let draggedWrapper = null;

    this.container.querySelectorAll('.widget-wrapper').forEach(wrapper => {
      wrapper.addEventListener('dragstart', (e) => {
        const isInteractive = e.target.closest('input, textarea, button, pre, code, [contenteditable="true"]');
        if (isInteractive) {
          e.preventDefault();
          return;
        }
        draggedWrapper = wrapper;
        wrapper.classList.add('dragging');
      });

      wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
        this.saveCurrentLayout();
      });

      wrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = this.getDragAfterElement(e.clientX, e.clientY);
        if (afterElement == null) {
          this.container.appendChild(draggedWrapper);
        } else {
          this.container.insertBefore(draggedWrapper, afterElement);
        }
      });
    });
  },

  getDragAfterElement(x, y) {
    const draggableElements = [...this.container.querySelectorAll('.widget-wrapper:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2; // Simple horizontal ordering offset
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  },

  async saveCurrentLayout() {
    const list = [...this.container.querySelectorAll('.widget-wrapper')];
    const layouts = list.map((el, idx) => {
      const id = el.getAttribute('data-widget-id');
      const size = el.getAttribute('data-size');
      return {
        id,
        workspaceId: this.activeWorkspaceId,
        type: id.replace('w-', ''), // derive type
        size,
        displayOrder: idx,
        pinned: 1,
        visible: 1,
        config: {}
      };
    });

    try {
      await api.put(`/api/v1/workspaces/${this.activeWorkspaceId}/widgets`, layouts);
      console.log('Layout positions persisted successfully.');
    } catch (err) {
      console.error('Failed to persist widgets layout reorder:', err);
    }
  }
};

export default WidgetGrid;
