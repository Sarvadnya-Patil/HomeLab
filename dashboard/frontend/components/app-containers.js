// Containers Application - Dynamic Docker Manager View
import { api } from '../core/api.js';

export const AppContainers = {
  container: null,
  activeTab: 'containers',

  init(containerEl) {
    this.container = containerEl;
    this.render();
  },

  async render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">Docker Cluster Manager</span>
        <div class="panel-quick-actions" style="display: flex; gap: 0.4rem;">
          <button class="btn btn-panel ${this.activeTab === 'containers' ? 'btn-open' : ''}" id="tab-btn-containers">Containers</button>
          <button class="btn btn-panel ${this.activeTab === 'images' ? 'btn-open' : ''}" id="tab-btn-images">Images</button>
          <button class="btn btn-panel ${this.activeTab === 'volumes' ? 'btn-open' : ''}" id="tab-btn-volumes">Volumes</button>
          <button class="btn btn-panel ${this.activeTab === 'networks' ? 'btn-open' : ''}" id="tab-btn-networks">Networks</button>
        </div>
      </div>
      <div class="docker-view-content" id="docker-tab-content" style="margin-top: 1rem; width: 100%;">
        <div style="color: var(--text-muted);">Fetching Docker daemon registries...</div>
      </div>
    `;

    // Bind tab clicks
    this.container.querySelector('#tab-btn-containers').addEventListener('click', () => this.switchTab('containers'));
    this.container.querySelector('#tab-btn-images').addEventListener('click', () => this.switchTab('images'));
    this.container.querySelector('#tab-btn-volumes').addEventListener('click', () => this.switchTab('volumes'));
    this.container.querySelector('#tab-btn-networks').addEventListener('click', () => this.switchTab('networks'));

    this.loadTabContent();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  },

  async loadTabContent() {
    const contentEl = this.container.querySelector('#docker-tab-content');
    if (!contentEl) return;

    try {
      if (this.activeTab === 'containers') {
        const containers = await api.get('/api/v1/docker/containers');
        this.renderContainers(contentEl, containers);
      } else if (this.activeTab === 'images') {
        const images = await api.get('/api/v1/docker/images');
        this.renderImages(contentEl, images);
      } else if (this.activeTab === 'volumes') {
        const volumes = await api.get('/api/v1/docker/volumes');
        this.renderVolumes(contentEl, volumes);
      } else if (this.activeTab === 'networks') {
        const networks = await api.get('/api/v1/docker/networks');
        this.renderNetworks(contentEl, networks);
      }
    } catch (err) {
      contentEl.innerHTML = `<div style="color: var(--term-amber); font-family: var(--font-mono); font-size: 0.75rem;">Failed to fetch Docker daemon API: ${err.message}</div>`;
    }
  },

  renderContainers(target, list) {
    if (list.length === 0) {
      target.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">No containers found on Docker host.</div>';
      return;
    }

    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-slate); color: var(--text-muted); font-family: var(--font-mono);">
            <th style="padding: 0.5rem;">CONTAINER NAME</th>
            <th style="padding: 0.5rem;">STATE</th>
            <th style="padding: 0.5rem;">STATUS</th>
            <th style="padding: 0.5rem;">IMAGE</th>
            <th style="padding: 0.5rem; text-align: right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(c => {
      const name = c.Names[0] ? c.Names[0].replace('/', '') : 'Unnamed';
      const isRunning = c.State === 'running';
      html += `
        <tr style="border-bottom: 1px dashed rgba(255,255,255,0.02); height: 40px;" data-container-id="${c.Id}">
          <td style="padding: 0.5rem; font-weight: bold; color: var(--text-primary);">${name}</td>
          <td style="padding: 0.5rem;"><span class="card-status ${isRunning ? 'online' : 'offline'}" style="padding: 0.1rem 0.35rem; border-radius: 3px; font-family: var(--font-mono); font-size: 0.65rem;">${c.State}</span></td>
          <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${c.Status}</td>
          <td style="padding: 0.5rem; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.65rem;">${c.Image || ''}</td>
          <td style="padding: 0.5rem; text-align: right;">
            <button class="btn btn-panel btn-container-toggle" data-container-id="${c.Id}" data-service-id="${name}">${isRunning ? 'Stop' : 'Start'}</button>
            <button class="btn btn-panel btn-container-restart" data-container-id="${c.Id}" data-service-id="${name}">Restart</button>
            <button class="btn btn-panel danger-btn btn-container-remove" data-container-id="${c.Id}">Remove</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    target.innerHTML = html;

    // Attach actions
    target.querySelectorAll('.btn-container-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-container-id');
        const sId = btn.getAttribute('data-service-id');
        this.triggerAction(id, sId, 'toggle');
      });
    });

    target.querySelectorAll('.btn-container-restart').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-container-id');
        const sId = btn.getAttribute('data-service-id');
        this.triggerAction(id, sId, 'restart');
      });
    });

    target.querySelectorAll('.btn-container-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-container-id');
        if (confirm('Are you sure you want to remove this container?')) {
          this.triggerAction(id, id, 'remove');
        }
      });
    });
  },

  renderImages(target, list) {
    let html = `
      <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem;">
        <input type="text" placeholder="Pull image tag (e.g. nginx:alpine)..." id="input-pull-image" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.35rem 0.5rem; color: var(--text-primary); font-family: var(--font-mono); font-size: 0.75rem; width: 300px;">
        <button class="btn btn-panel" id="btn-pull-image">Pull Image</button>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-slate); color: var(--text-muted); font-family: var(--font-mono);">
            <th style="padding: 0.5rem;">REPO TAGS</th>
            <th style="padding: 0.5rem;">SIZE</th>
            <th style="padding: 0.5rem;">CREATED</th>
            <th style="padding: 0.5rem; text-align: right;">IMAGE ID</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(img => {
      const tag = img.RepoTags && img.RepoTags[0] ? img.RepoTags[0] : 'None';
      const sizeMb = (img.Size / (1024 * 1024)).toFixed(1);
      const shortId = img.Id.replace('sha256:', '').substring(0, 12);
      const created = new Date(img.Created * 1000).toLocaleDateString();

      html += `
        <tr style="border-bottom: 1px dashed rgba(255,255,255,0.02); height: 40px;">
          <td style="padding: 0.5rem; font-weight: bold; color: var(--text-primary); font-family: var(--font-mono);">${tag}</td>
          <td style="padding: 0.5rem; font-family: var(--font-mono);">${sizeMb} MB</td>
          <td style="padding: 0.5rem; color: var(--text-secondary);">${created}</td>
          <td style="padding: 0.5rem; text-align: right; color: var(--text-muted); font-family: var(--font-mono);">${shortId}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    target.innerHTML = html;

    // Attach Pull
    const btnPull = target.querySelector('#btn-pull-image');
    const inputPull = target.querySelector('#input-pull-image');
    if (btnPull && inputPull) {
      btnPull.addEventListener('click', async () => {
        const image = inputPull.value.trim();
        if (!image) return;
        btnPull.textContent = 'Pulling...';
        btnPull.disabled = true;
        try {
          await api.post('/api/v1/docker/images', { image });
          alert(`Successfully pulled image [${image}]`);
          this.loadTabContent();
        } catch (err) {
          alert(`Failed to pull image: ${err.message}`);
          btnPull.textContent = 'Pull Image';
          btnPull.disabled = false;
        }
      });
    }
  },

  renderVolumes(target, list) {
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-slate); color: var(--text-muted); font-family: var(--font-mono);">
            <th style="padding: 0.5rem;">VOLUME NAME</th>
            <th style="padding: 0.5rem;">DRIVER</th>
            <th style="padding: 0.5rem;">SCOPE</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(v => {
      html += `
        <tr style="border-bottom: 1px dashed rgba(255,255,255,0.02); height: 40px;">
          <td style="padding: 0.5rem; font-weight: bold; color: var(--text-primary); font-family: var(--font-mono);">${v.Name}</td>
          <td style="padding: 0.5rem; font-family: var(--font-mono);">${v.Driver}</td>
          <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${v.Scope}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    target.innerHTML = html;
  },

  renderNetworks(target, list) {
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-slate); color: var(--text-muted); font-family: var(--font-mono);">
            <th style="padding: 0.5rem;">NETWORK NAME</th>
            <th style="padding: 0.5rem;">DRIVER</th>
            <th style="padding: 0.5rem;">SCOPE</th>
            <th style="padding: 0.5rem; text-align: right;">NETWORK ID</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(n => {
      const shortId = n.Id.substring(0, 12);
      html += `
        <tr style="border-bottom: 1px dashed rgba(255,255,255,0.02); height: 40px;">
          <td style="padding: 0.5rem; font-weight: bold; color: var(--text-primary); font-family: var(--font-mono);">${n.Name}</td>
          <td style="padding: 0.5rem; font-family: var(--font-mono);">${n.Driver}</td>
          <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${n.Scope}</td>
          <td style="padding: 0.5rem; text-align: right; color: var(--text-muted); font-family: var(--font-mono);">${shortId}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    target.innerHTML = html;
  },

  async triggerAction(containerId, serviceId, action) {
    try {
      await api.post(`/api/v1/services/${serviceId}/action`, { action });
      this.loadTabContent();
    } catch (err) {
      alert(`Action [${action.toUpperCase()}] failed: ${err.message}`);
    }
  }
};

export default AppContainers;
