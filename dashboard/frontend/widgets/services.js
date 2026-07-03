// Services list widget module (dynamic categories-grouped services card matrix)
import { store } from '../core/state.js';
import { api } from '../core/api.js';
import { getIcon } from '../utils/icons.js';

export default {
  id: 'services',
  title: 'Discovered Services',
  icon: 'server',
  supportedSizes: ['full'],
  wsEvents: ['services', 'categories'],

  render(container) {
    container.className = 'grid-services widget-item';
    container.style.overflowY = 'auto';
    container.style.maxHeight = '100%';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title">Active Environment Services</span>
        <div class="panel-quick-actions">
          <button class="btn btn-panel" id="w-btn-add-category">+ New Category</button>
          <button class="btn btn-panel" id="w-btn-restart-docker">Restart Docker</button>
          <button class="btn btn-panel danger-btn" id="w-btn-reboot">Reboot Host</button>
        </div>
      </div>
      <div class="services-wrapper" id="w-services-categories-container" style="display: flex; flex-direction: column; gap: 1.5rem; width: 100%;">
        <div style="color: var(--text-muted);">Scanning services...</div>
      </div>
    `;

    // Bind panel global actions
    container.querySelector('#w-btn-add-category').addEventListener('click', () => this.promptAddCategory());
    container.querySelector('#w-btn-restart-docker').addEventListener('click', () => this.triggerOSAction('restart-docker'));
    container.querySelector('#w-btn-reboot').addEventListener('click', () => this.triggerOSAction('reboot'));
  },

  update(container, data) {
    // Note: The widget-grid updater passes the full catalog of enriched services
    const wrapper = container.querySelector('#w-services-categories-container');
    if (!wrapper) return;

    const services = store.get('services') || [];
    const categories = store.get('categories') || [];
    const filterQuery = (document.getElementById("cmd-palette")?.value || '').toLowerCase();

    wrapper.innerHTML = '';

    // Sort categories by display order
    const sortedCategories = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);

    if (sortedCategories.length === 0) {
      wrapper.innerHTML = '<div style="color: var(--text-muted); padding: 1rem 0;">No workspaces or categories found. Create a category to get started.</div>';
      return;
    }

    sortedCategories.forEach(cat => {
      // Find services matching this category
      const catServices = services.filter(s => {
        const matchesCategory = s.category.toLowerCase() === cat.id.toLowerCase() || s.category === cat.name;
        const matchesFilter = !filterQuery || s.name.toLowerCase().includes(filterQuery) || s.description.toLowerCase().includes(filterQuery);
        const isInstalled = s.status !== 'Not Installed';
        return matchesCategory && matchesFilter && isInstalled;
      });

      // Renders collapsed state
      const isCollapsed = cat.collapsed;

      const catSection = document.createElement('div');
      catSection.className = `category-section-container ${isCollapsed ? 'collapsed' : ''}`;
      catSection.setAttribute('data-category-id', cat.id);
      catSection.style.borderLeft = `3px solid ${cat.accent || '#8b8b8b'}`;
      catSection.style.paddingLeft = '0.75rem';
      catSection.style.marginBottom = '0.5rem';

      // Header row with details
      catSection.innerHTML = `
        <div class="category-section-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.25rem 0; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="cat-toggle-arrow" style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0)'}; transition: transform 0.15s ease;">▼</span>
            <span class="category-title" style="font-size: 0.8rem; font-weight: bold; text-transform: uppercase; color: var(--text-primary);">${cat.name}</span>
            <span style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono);">(${catServices.length})</span>
          </div>
          <div class="category-header-actions" style="display: flex; gap: 0.25rem;">
            <button class="btn btn-panel btn-cat-rename" style="font-size: 0.6rem; padding: 0.15rem 0.35rem;">Rename</button>
            <button class="btn btn-panel btn-cat-accent" style="font-size: 0.6rem; padding: 0.15rem 0.35rem;">Color</button>
            <button class="btn btn-panel btn-cat-delete" style="font-size: 0.6rem; padding: 0.15rem 0.35rem; color: var(--border-focus);">Delete</button>
          </div>
        </div>
        <div class="services-cards-grid-row" style="display: ${isCollapsed ? 'none' : 'grid'}; gap: 0.75rem; min-height: 50px; padding: 0.25rem 0;">
          <!-- Cards go here -->
        </div>
      `;

      // Header arrow toggle click
      catSection.querySelector('.category-section-header').addEventListener('click', (e) => {
        // Prevent action triggers triggering collapse
        if (e.target.closest('button')) return;
        this.toggleCategoryCollapse(cat.id, !isCollapsed);
      });

      // Bind category specific actions
      catSection.querySelector('.btn-cat-rename').addEventListener('click', () => this.promptRenameCategory(cat.id, cat.name));
      catSection.querySelector('.btn-cat-accent').addEventListener('click', () => this.promptAccentCategory(cat.id, cat.accent));
      catSection.querySelector('.btn-cat-delete').addEventListener('click', () => this.promptDeleteCategory(cat.id, cat.name));

      const cardsGrid = catSection.querySelector('.services-cards-grid-row');

      if (catServices.length === 0) {
        cardsGrid.innerHTML = `
          <div class="col-span-6 empty-category-placeholder" style="border: 1px dashed var(--border-slate); border-radius: 6px; padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.75rem; width: 100%; grid-column: 1 / -1;">
            No services registered in this category. <a href="#" class="add-service-link" style="color: var(--text-primary); text-decoration: underline;">+ Add Service</a>
          </div>
        `;
        cardsGrid.querySelector('.add-service-link').addEventListener('click', (e) => {
          e.preventDefault();
          this.promptAddServiceToCategory(cat.id);
        });
      } else {
        catServices.forEach(service => {
          const card = this.createServiceCard(service);
          cardsGrid.appendChild(card);
        });
      }

      // Drag & Drop categories reorder + drop service zone
      this.bindDragDrop(catSection, cardsGrid, cat.id);

      wrapper.appendChild(catSection);
    });
  },

  // Renders dynamic service card using Capabilities whitelisting
  createServiceCard(service) {
    const isOnline = service.status === "Active" || service.status === "Online";
    const statusClass = service.status.toLowerCase().replace(' ', '-');

    let href = '#';
    if (service.domain && service.domain.public) {
      href = `http://${service.domain.public}`;
    } else if (service.ports && service.ports.http) {
      href = `http://localhost:${service.ports.http}`;
    }

    const isPublic = service.permissions && service.permissions.tunnelExposed;
    const adminOnly = service.permissions && service.permissions.adminOnly;
    
    let badges = '';
    if (isPublic) {
      badges += `<span class="card-badge badge-public">Tunnel</span>`;
    } else {
      badges += `<span class="card-badge badge-local">Local Only</span>`;
    }
    if (adminOnly) {
      badges += `<span class="card-badge badge-admin">Admin</span>`;
    }

    // Dynamic Capabilities checks
    const capabilities = service.capabilities || (service.ports && service.ports.http ? ['open', 'start', 'stop', 'restart', 'logs'] : ['start', 'stop', 'restart', 'logs']);
    let actionButtons = '';
    
    if (service.status !== 'Not Installed') {
      if (capabilities.includes('open')) {
        actionButtons += `<button class="btn-card-act btn-open" onclick="window.open('${href}')">Open</button>`;
      }
      if (capabilities.includes('restart') && isOnline) {
        actionButtons += `<button class="btn-card-act" data-action="restart" data-service-id="${service.id}">Restart</button>`;
      }
      if ((capabilities.includes('stop') && isOnline) || (capabilities.includes('start') && !isOnline)) {
        actionButtons += `<button class="btn-card-act" data-action="toggle" data-service-id="${service.id}">${isOnline ? 'Stop' : 'Start'}</button>`;
      }
      if (capabilities.includes('logs')) {
        actionButtons += `<button class="btn-card-act" data-action="logs" data-service-id="${service.id}">Logs</button>`;
      }
    } else {
      actionButtons += `<span style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono); line-height: 2;">Not Installed</span>`;
    }

    const colSpan = (service.category === 'Infrastructure' || service.id === 'portainer' || service.id === 'homepage') ? 'col-span-3' : 'col-span-2';
    const card = document.createElement("div");
    card.className = `service-card ${colSpan}`;
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-service-id', service.id);

    card.innerHTML = `
      <div class="card-header-row" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; width: 100%; min-width: 0;">
        <div class="card-title-group" style="display: flex; align-items: center; gap: 0.4rem; min-width: 0; flex: 1;">
          <span class="card-icon" style="flex-shrink: 0; display: flex; align-items: center;">${getIcon(service.id)}</span>
          <span class="card-name" style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 100%;" title="${service.name}">${service.name}</span>
          <span class="card-version" style="font-size: 0.65rem; font-family: var(--font-mono); color: var(--text-muted); flex-shrink: 0;">v${service.version}</span>
        </div>
        <span class="card-status ${isOnline ? 'online' : 'offline'}" style="flex-shrink: 0; font-size: 0.7rem; font-family: var(--font-mono); display: flex; align-items: center; padding: 0.15rem 0.35rem; border-radius: 3px;">${service.status}</span>
      </div>
      <p class="service-description" style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; min-height: 32px;">${service.description}</p>
      
      <div class="card-badges-row" style="margin-top: 0.25rem;">
        ${badges}
      </div>

      <div class="card-grid-details" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; border-top: 1px dashed var(--border-slate); border-bottom: 1px dashed var(--border-slate); padding: 0.5rem 0; font-size: 0.7rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">
        <div class="detail-item">
          <span class="detail-label" style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Exposed Port</span>
          <span class="detail-val" style="font-family: var(--font-mono); color: var(--text-secondary);">${service.ports && service.ports.http ? service.ports.http : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Latency</span>
          <span class="detail-val" style="font-family: var(--font-mono); color: var(--text-secondary);">${service.details ? service.details.latency : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Uptime</span>
          <span class="detail-val" style="font-family: var(--font-mono); color: var(--text-secondary);">${service.details ? service.details.uptime : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label" style="color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">Last Check</span>
          <span class="detail-val" style="font-family: var(--font-mono); color: var(--text-secondary);">${service.details ? service.details.lastCheck : 'N/A'}</span>
        </div>
      </div>

      <div class="card-actions-row" style="display: flex; gap: 0.3rem; margin-top: auto;">
        ${actionButtons}
      </div>
    `;

    // Drag start handler
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', service.id);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    // Bind card actions click
    card.querySelectorAll('.btn-card-act[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        const sId = btn.getAttribute('data-service-id');
        this.triggerServiceAction(sId, action);
      });
    });

    return card;
  },

  bindDragDrop(catSection, cardsGrid, categoryId) {
    cardsGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
      cardsGrid.classList.add('drag-over');
    });

    cardsGrid.addEventListener('dragleave', () => {
      cardsGrid.classList.remove('drag-over');
    });

    cardsGrid.addEventListener('drop', async (e) => {
      e.preventDefault();
      cardsGrid.classList.remove('drag-over');
      const serviceId = e.dataTransfer.getData('text/plain');
      if (!serviceId) return;

      console.log(`Reassigning service [${serviceId}] to category [${categoryId}]`);
      try {
        await api.put(`/api/v1/services/${serviceId}/category`, { categoryId });
        
        // Optimistically update store
        const currentServices = store.get('services') || [];
        store.set('services', currentServices.map(s => s.id === serviceId ? { ...s, category: categoryId } : s));
      } catch (err) {
        alert(`Failed to move service: ${err.message}`);
      }
    });
  },

  async triggerServiceAction(serviceId, action) {
    // If requesting logs, broadcast terminal focus
    if (action === 'logs') {
      store.emit('ui_logs_focus', { value: serviceId });
      return;
    }

    try {
      // Call engine post lifecycle action
      await api.post(`/api/v1/services/${serviceId}/action`, { action });
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    }
  },

  async toggleCategoryCollapse(categoryId, collapsed) {
    try {
      const updated = await api.put(`/api/v1/categories/${categoryId}`, { collapsed });
      const current = store.get('categories') || [];
      store.set('categories', current.map(c => c.id === categoryId ? updated : c));
    } catch (err) {
      console.error(err.message);
    }
  },

  async promptAddCategory() {
    const name = prompt("Enter new category name:");
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const workspaceId = store.get('activeWorkspace');

    try {
      const created = await api.post('/api/v1/categories', {
        id,
        workspaceId,
        name,
        displayOrder: 10,
        collapsed: false,
        visible: true
      });
      const current = store.get('categories') || [];
      store.set('categories', [...current, created]);
    } catch (err) {
      alert(`Failed to create category: ${err.message}`);
    }
  },

  async promptRenameCategory(categoryId, currentName) {
    const name = prompt("Enter new category name:", currentName);
    if (!name || name === currentName) return;

    try {
      const updated = await api.put(`/api/v1/categories/${categoryId}`, { name });
      const current = store.get('categories') || [];
      store.set('categories', current.map(c => c.id === categoryId ? updated : c));
    } catch (err) {
      alert(`Failed to rename category: ${err.message}`);
    }
  },

  async promptAccentCategory(categoryId, currentAccent) {
    const accent = prompt("Enter category HEX color (e.g. #3b82f6):", currentAccent);
    if (!accent || accent === currentAccent) return;

    try {
      const updated = await api.put(`/api/v1/categories/${categoryId}`, { accent });
      const current = store.get('categories') || [];
      store.set('categories', current.map(c => c.id === categoryId ? updated : c));
    } catch (err) {
      alert(`Failed to update color: ${err.message}`);
    }
  },

  async promptDeleteCategory(categoryId, categoryName) {
    if (!confirm(`Are you sure you want to delete category "${categoryName}"? Services in it will revert to uncategorized.`)) return;

    try {
      await api.delete(`/api/v1/categories/${categoryId}`);
      const current = store.get('categories') || [];
      store.set('categories', current.filter(c => c.id !== categoryId));
    } catch (err) {
      alert(`Failed to delete category: ${err.message}`);
    }
  },

  async promptAddServiceToCategory(categoryId) {
    const serviceId = prompt("Enter service ID to move into this category:");
    if (!serviceId) return;

    try {
      await api.put(`/api/v1/services/${serviceId}/category`, { categoryId });
      const currentServices = store.get('services') || [];
      store.set('services', currentServices.map(s => s.id === serviceId ? { ...s, category: categoryId } : s));
    } catch (err) {
      alert(`Failed to add service: ${err.message}`);
    }
  },

  async triggerOSAction(action) {
    try {
      const res = await api.post('/api/v1/system/action', { action });
      alert(res.message || 'Action executed successfully.');
    } catch (err) {
      alert(`OS Action failed: ${err.message}`);
    }
  }
};
