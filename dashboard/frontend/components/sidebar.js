// Sidebar Workspace Selector Component - Dynamic Navigation Registry
import { store } from '../core/state.js';
import { getIcon } from '../utils/icons.js';

export const Sidebar = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    
    // Rerender sidebar whenever activeApp or apps change
    store.on('apps', () => this.render());
    store.on('activeApp', () => this.render());
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
    });

    html += `
      </div>
    `;

    this.container.innerHTML = html;

    const closeMobileSidebar = () => {
      const sidebarEl = document.querySelector('.sidebar');
      const backdropEl = document.getElementById('sidebar-backdrop');
      if (sidebarEl && sidebarEl.classList.contains('mobile-open')) {
        sidebarEl.classList.remove('mobile-open');
      }
      if (backdropEl && !backdropEl.classList.contains('hidden')) {
        backdropEl.classList.add('hidden');
      }
    };

    // Attach click events for app switching
    this.container.querySelectorAll('.app-nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const appId = el.getAttribute('data-app-id');
        store.set('activeApp', appId);
        closeMobileSidebar();
      });
    });
  }
};

export default Sidebar;
