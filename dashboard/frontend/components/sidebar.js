// Sidebar Workspace Selector Component - Dynamic Navigation Registry
import { store } from '../core/state.js';
import { getIcon } from '../utils/icons.js';
import { api } from '../core/api.js';

export const Sidebar = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    
    // Rerender sidebar whenever activeApp, apps, workspaces, or activeWorkspace changes
    store.on('apps', () => this.render());
    store.on('activeApp', () => this.render());
    store.on('workspaces', () => this.render());
    store.on('activeWorkspace', () => this.render());
    store.on('sidebarCollapsed', () => this.updateCollapseClass());

    // Bind sidebar collapse toggle button listener
    const headerLogo = document.querySelector('.sidebar-header');
    if (headerLogo) {
      headerLogo.addEventListener('click', () => {
        const current = store.get('sidebarCollapsed');
        store.set('sidebarCollapsed', !current);
      });
    }

    this.updateCollapseClass();
  },

  updateCollapseClass() {
    const isCollapsed = store.get('sidebarCollapsed');
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  },

  async render() {
    if (!this.container) return;

    const apps = store.get('apps') || [];
    const activeAppId = store.get('activeApp');
    const workspaces = store.get('workspaces') || [];
    const activeWorkspaceId = store.get('activeWorkspace');

    let html = `
      <div class="sidebar-nav-list" style="display: flex; flex-direction: column; gap: 0.35rem;">
    `;

    // Render registered applications from control plane
    apps.forEach(app => {
      const isActive = app.id === activeAppId;
      const iconMarkup = getIcon(app.icon || 'grid');
      html += `
        <a href="#/app/${app.id}" class="nav-item app-nav-item ${isActive ? 'active' : ''}" data-app-id="${app.id}">
          ${iconMarkup}
          <span class="nav-item-label">${app.name}</span>
        </a>
      `;

      // If active application is 'dashboard', nest workspaces sub-menu directly underneath
      if (app.id === 'dashboard' && isActive) {
        html += `
          <div class="sidebar-nested-workspaces" style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem; margin-bottom: 0.5rem; border-left: 1px dashed var(--border-slate); margin-left: 0.75rem;">
        `;
        workspaces.forEach(ws => {
          const isWsActive = ws.id === activeWorkspaceId;
          const wsIcon = getIcon(ws.icon || 'layout');
          html += `
            <a href="#/workspace/${ws.id}" class="nav-item ws-nav-item ${isWsActive ? 'active' : ''}" data-ws-id="${ws.id}" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; border: none; background: none;">
              ${wsIcon}
              <span class="nav-item-label">${ws.name}</span>
            </a>
          `;
        });
        html += `
            <button class="btn btn-card-act" id="btn-add-workspace" style="font-size: 0.6rem; padding: 0.2rem; margin-top: 0.25rem;">+ Add Workspace</button>
          </div>
        `;
      }
    });

    html += `
      </div>
    `;

    // Render dashboard layout customization actions
    if (activeAppId === 'dashboard') {
      html += `
        <div class="sidebar-manage-row" style="margin-top: 1rem; border-top: 1px dashed var(--border-slate); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
          <button class="btn btn-card-act" id="btn-edit-workspace" style="font-size: 0.65rem;">Manage Workspaces</button>
        </div>
      `;
    }

    this.container.innerHTML = html;

    // Attach click events for app switching
    this.container.querySelectorAll('.app-nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const appId = el.getAttribute('data-app-id');
        store.set('activeApp', appId);
      });
    });

    // Attach click events for nested workspaces
    this.container.querySelectorAll('.ws-nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const wsId = el.getAttribute('data-ws-id');
        store.set('activeWorkspace', wsId);
      });
    });

    // Bind Add Workspace action
    const btnAdd = this.container.querySelector('#btn-add-workspace');
    if (btnAdd) {
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptAddWorkspace();
      });
    }

    // Bind Manage workspace
    const btnEdit = this.container.querySelector('#btn-edit-workspace');
    if (btnEdit) {
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptManageWorkspaces();
      });
    }
  },

  async promptAddWorkspace() {
    const name = prompt("Enter new workspace name:");
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    try {
      const created = await api.post('/api/v1/workspaces', { id, name, icon: 'grid', displayOrder: 99 });
      
      const current = store.get('workspaces') || [];
      store.set('workspaces', [...current, created]);
      store.set('activeWorkspace', created.id);
    } catch (err) {
      alert(`Failed to create workspace: ${err.message}`);
    }
  },

  async promptManageWorkspaces() {
    const activeId = store.get('activeWorkspace');
    const workspaces = store.get('workspaces') || [];
    const active = workspaces.find(w => w.id === activeId);
    if (!active) return;

    const action = prompt(`Workspace Management for [${active.name}]:\nType "rename" to change name\nType "delete" to delete workspace\nType "icon" to change icon`);
    if (!action) return;

    if (action.toLowerCase() === 'rename') {
      const newName = prompt("Enter new name:", active.name);
      if (!newName) return;
      try {
        const updated = await api.put(`/api/v1/workspaces/${active.id}`, { name: newName });
        store.set('workspaces', workspaces.map(w => w.id === active.id ? updated : w));
      } catch (err) {
        alert(err.message);
      }
    } else if (action.toLowerCase() === 'icon') {
      const newIcon = prompt("Enter new icon name (grid|layout|server|activity|sparkles|globe|database):", active.icon);
      if (!newIcon) return;
      try {
        const updated = await api.put(`/api/v1/workspaces/${active.id}`, { icon: newIcon });
        store.set('workspaces', workspaces.map(w => w.id === active.id ? updated : w));
      } catch (err) {
        alert(err.message);
      }
    } else if (action.toLowerCase() === 'delete') {
      if (active.id === 'overview') {
        alert("Cannot delete default Overview workspace.");
        return;
      }
      if (!confirm(`Are you sure you want to delete workspace [${active.name}]? All widgets will be deleted.`)) return;
      try {
        await api.delete(`/api/v1/workspaces/${active.id}`);
        store.set('workspaces', workspaces.filter(w => w.id !== active.id));
        store.set('activeWorkspace', 'overview');
      } catch (err) {
        alert(err.message);
      }
    }
  }
};

export default Sidebar;
