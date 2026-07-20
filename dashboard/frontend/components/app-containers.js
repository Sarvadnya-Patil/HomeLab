// Containers Application - Dynamic Docker Manager View
import { api } from '../core/api.js';
import { Dialog } from '../utils/dialog.js';
import { getIcon } from '../utils/icons.js';

export const AppContainers = {
  container: null,
  activeTab: 'containers',
  cachedList: null,
  onSearchInput: null,

  init(containerEl) {
    this.container = containerEl;
    this.cachedList = null;
    this.cachedSerialized = null;
    this.refreshInterval = null;

    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      this.onSearchInput = () => {
        this.filterAndRenderContent();
      };
      mainSearchBar.addEventListener('input', this.onSearchInput);
    }

    // Auto-refresh Docker states in the background every 3 seconds silently
    this.refreshInterval = setInterval(() => this.refreshTabContent(), 3000);

    window.activeAppDestroy = () => this.destroy();

    this.render();
  },

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar && this.onSearchInput) {
      mainSearchBar.removeEventListener('input', this.onSearchInput);
    }
    this.container = null;
    this.cachedList = null;
    this.cachedSerialized = null;
  },

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  async render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span class="panel-title" style="font-size: 0.9rem; font-weight: bold; text-transform: uppercase;">Docker Cluster Manager</span>
        <div class="panel-quick-actions" style="display: flex; gap: 0.4rem; align-items: center;">
          <button class="btn btn-panel ${this.activeTab === 'containers' ? 'btn-open' : ''}" id="tab-btn-containers">Containers</button>
          <button class="btn btn-panel ${this.activeTab === 'images' ? 'btn-open' : ''}" id="tab-btn-images">Images</button>
          <button class="btn btn-panel ${this.activeTab === 'volumes' ? 'btn-open' : ''}" id="tab-btn-volumes">Volumes</button>
          <button class="btn btn-panel ${this.activeTab === 'networks' ? 'btn-open' : ''}" id="tab-btn-networks">Networks</button>
          ${this.activeTab === 'containers' ? `
            <button class="btn btn-panel" id="btn-scan-compose" style="margin-left: 0.5rem; color: var(--text-accent, #60a5fa); border-color: var(--text-accent, #60a5fa); display: flex; align-items: center; gap: 0.35rem;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Scan System Compose
            </button>
          ` : ''}
        </div>
      </div>
      <div class="docker-view-content" id="docker-tab-content" style="margin-top: 1rem; width: 100%;">
        <div class="circular-loader-overlay">
          <div class="circular-spinner"></div>
          <span class="circular-loader-text">FETCHING CONTAINER ENGINE MATRIX...</span>
        </div>
      </div>
    `;

    // Bind tab clicks
    this.container.querySelector('#tab-btn-containers').addEventListener('click', () => this.switchTab('containers'));
    this.container.querySelector('#tab-btn-images').addEventListener('click', () => this.switchTab('images'));
    this.container.querySelector('#tab-btn-volumes').addEventListener('click', () => this.switchTab('volumes'));
    this.container.querySelector('#tab-btn-networks').addEventListener('click', () => this.switchTab('networks'));

    // Bind Scan Compose button click
    const scanBtn = this.container.querySelector('#btn-scan-compose');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        const confirmScan = await Dialog.confirm({
          title: 'Scan System Compose Files',
          message: 'This will recursively scan your workspace and user folders (Documents, Desktop, and project directories) for docker-compose configurations, auto-registering any offline stacks. Continue?'
        });
        if (confirmScan) {
          try {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Scanning...';
            const res = await api.post('/api/v1/docker/scan-compose', {});
            alert(`Scan task triggered as background job: ${res.jobId}`);
          } catch (err) {
            alert(`Scan failed: ${err.message}`);
          } finally {
            scanBtn.disabled = false;
            scanBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Scan System Compose`;
          }
        }
      });
    }

    this.loadTabContent();
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.cachedList = null;
    this.cachedSerialized = null;
    this.render();
  },

  async getEnrichedContainers() {
    try {
      const [containers, services] = await Promise.all([
        api.get('/api/v1/docker/containers'),
        api.get('/api/v1/services')
      ]);

      // Find registered services that do not have a matching container on the Docker host
      services.forEach(s => {
        const hasContainer = containers.some(c => 
          c.Names && c.Names.some(name => name === `/${s.id}` || name.endsWith(`-${s.id}`))
        );
        if (!hasContainer) {
          // Synthesize a placeholder entry for the removed service so the user can easily click Recreate
          containers.push({
            Id: '',
            Names: [`/${s.id}`],
            State: 'Offline',
            Status: 'Not Deployed',
            Image: s.version || 'latest',
            IsServicePlaceholder: true
          });
        }
      });

      return containers;
    } catch (err) {
      console.error('Failed to get enriched containers list:', err);
      // Fallback to basic containers list if services API is slow/fails
      return api.get('/api/v1/docker/containers');
    }
  },

  async loadTabContent() {
    const contentEl = this.container.querySelector('#docker-tab-content');
    if (!contentEl) return;

    // Render circular spinner while loading
    contentEl.innerHTML = `
      <div class="circular-loader-overlay">
        <div class="circular-spinner"></div>
        <span class="circular-loader-text">FETCHING CONTAINER ENGINE MATRIX...</span>
      </div>
    `;

    try {
      if (this.activeTab === 'containers') {
        const containers = await this.getEnrichedContainers();
        this.cachedSerialized = JSON.stringify(containers);
        this.cachedList = containers;
      } else if (this.activeTab === 'images') {
        const images = await api.get('/api/v1/docker/images');
        this.cachedSerialized = JSON.stringify(images);
        this.cachedList = images;
      } else if (this.activeTab === 'volumes') {
        const volumes = await api.get('/api/v1/docker/volumes');
        this.cachedSerialized = JSON.stringify(volumes);
        this.cachedList = volumes;
      } else if (this.activeTab === 'networks') {
        const networks = await api.get('/api/v1/docker/networks');
        this.cachedSerialized = JSON.stringify(networks);
        this.cachedList = networks;
      }
      this.filterAndRenderContent();
    } catch (err) {
      contentEl.innerHTML = `<div style="color: var(--term-amber); font-family: var(--font-mono); font-size: 0.75rem;">Failed to fetch Docker daemon API: ${err.message}</div>`;
    }
  },

  async refreshTabContent() {
    if (!this.container || !this.cachedList) return;
    if (this.isActionInProgress || (this.lastActionTime && Date.now() - this.lastActionTime < 4000)) {
      return;
    }
    try {
      let data = null;
      if (this.activeTab === 'containers') {
        data = await this.getEnrichedContainers();
      } else if (this.activeTab === 'images') {
        data = await api.get('/api/v1/docker/images');
      } else if (this.activeTab === 'volumes') {
        data = await api.get('/api/v1/docker/volumes');
      } else if (this.activeTab === 'networks') {
        data = await api.get('/api/v1/docker/networks');
      }
      
      if (data) {
        const serialized = JSON.stringify(data);
        if (this.cachedSerialized !== serialized) {
          this.cachedSerialized = serialized;
          this.cachedList = data;
          this.filterAndRenderContent();
        }
      }
    } catch (err) {
      console.warn('Failed to auto-refresh tab data:', err);
    }
  },

  filterAndRenderContent() {
    const contentEl = this.container?.querySelector('#docker-tab-content');
    if (!contentEl || !this.cachedList) return;

    const filterQuery = (document.getElementById("cmd-palette")?.value || '').toLowerCase();
    
    const filtered = this.cachedList.filter(item => {
      if (!filterQuery) return true;
      
      if (this.activeTab === 'containers') {
        const name = item.Names && item.Names[0] ? item.Names[0].replace('/', '') : '';
        const id = item.Id || '';
        return name.toLowerCase().includes(filterQuery) || id.toLowerCase().includes(filterQuery);
      } else if (this.activeTab === 'images') {
        const repoTags = item.RepoTags ? item.RepoTags.join(' ') : '';
        const id = item.Id || '';
        return repoTags.toLowerCase().includes(filterQuery) || id.toLowerCase().includes(filterQuery);
      } else if (this.activeTab === 'volumes') {
        const name = item.Name || '';
        return name.toLowerCase().includes(filterQuery);
      } else if (this.activeTab === 'networks') {
        const name = item.Name || '';
        const id = item.Id || '';
        return name.toLowerCase().includes(filterQuery) || id.toLowerCase().includes(filterQuery);
      }
      return true;
    });

    if (this.activeTab === 'containers') {
      this.renderContainers(contentEl, filtered);
    } else if (this.activeTab === 'images') {
      this.renderImages(contentEl, filtered);
    } else if (this.activeTab === 'volumes') {
      this.renderVolumes(contentEl, filtered);
    } else if (this.activeTab === 'networks') {
      this.renderNetworks(contentEl, filtered);
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
            <th style="padding: 0.5rem;">AUTOSTART</th>
            <th style="padding: 0.5rem;">IMAGE</th>
            <th style="padding: 0.5rem; text-align: right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach(c => {
      const name = c.Names[0] ? c.Names[0].replace('/', '') : 'Unnamed';
      const isRunning = c.State === 'running';

      const escName = this.escapeHtml(name);
      const escState = this.escapeHtml(c.State);
      const escStatus = this.escapeHtml(c.Status);
      const escImage = this.escapeHtml(c.Image || '');

      const isPlaceholder = c.IsServicePlaceholder === true;

      const autostartTd = isPlaceholder ? `
        <td style="padding: 0.5rem; color: var(--text-muted); font-size: 0.7rem;">N/A</td>
      ` : `
        <td style="padding: 0.5rem;">
          <label class="switch">
            <input type="checkbox" class="autostart-toggle" data-container-id="${c.Id}" ${c.Autostart ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
      `;

      const guessLogoName = (id) => {
        // Method 1: Check Docker Compose project label
        if (c.Labels && c.Labels['com.docker.compose.project'] === 'homelab') {
          return 'falcon';
        }
        const ref = id.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const mappings = [
          { keywords: ['homelab', 'docker-proxy', 'dashboard', 'console'], logo: 'falcon' },
          { keywords: ['postgresql', 'postgres', 'postgre', 'pgsql', 'psql', 'pg-'], logo: 'postgresql' },
          { keywords: ['mariadb', 'maria', 'mariya'], logo: 'mariadb' },
          { keywords: ['mysql', 'my-sql'], logo: 'mysql' },
          { keywords: ['home-assistant', 'homeassistant', 'home-assist', 'hass'], logo: 'home-assistant' }
        ];
        for (const rule of mappings) {
          if (rule.keywords.some(kw => ref.includes(kw))) {
            return rule.logo;
          }
        }
        return ref;
      };

      const cacheKey = `logo-cont-${name}`;
      let logoHtml = '';
      if (window.logoUrlCache && window.logoUrlCache.has(cacheKey)) {
        logoHtml = window.logoUrlCache.get(cacheKey);
      } else {
        const refName = guessLogoName(name);
        const logoUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/webp/${refName}.webp`;
        logoHtml = `
          <img src="${logoUrl}" 
               alt="${escName}" 
               crossorigin="anonymous"
               data-cache-key="${cacheKey}"
               style="width: 16px; height: 16px; object-fit: contain;" 
               onload="window.handleLogoLoad(this)"
               onerror="this.onerror=null; const svg=decodeURIComponent('${encodeURIComponent(getIcon(name)).replace(/'/g, '%27')}'); if(window.logoUrlCache){window.logoUrlCache.set('${cacheKey}', svg);} this.outerHTML=svg;"/>
        `;
      }

      html += `
        <tr style="border-bottom: 1px dashed rgba(255,255,255,0.02); height: 40px;" data-container-id="${c.Id}">
          <td style="padding: 0.5rem; font-weight: bold; color: var(--text-primary);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;">
                ${logoHtml}
              </span>
              <span>${escName}</span>
            </div>
          </td>
          <td style="padding: 0.5rem;"><span class="nb-badge ${isRunning ? 'online' : 'offline'}">${escState.toUpperCase()}</span></td>
          <td style="padding: 0.5rem; color: var(--text-secondary); font-family: var(--font-mono);">${escStatus}</td>
          ${autostartTd}
          <td style="padding: 0.5rem; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.65rem;">${escImage}</td>
          <td style="padding: 0.5rem; text-align: right; display: flex; gap: 0.25rem; justify-content: flex-end; align-items: center; height: 40px;">
            ${isPlaceholder ? `
              <button class="btn btn-panel btn-container-recreate" data-container-id="" data-service-id="${escName}" style="color: var(--text-accent, #60a5fa); border-color: var(--text-accent, #60a5fa);">Recreate</button>
              <button class="btn btn-panel danger-btn btn-container-remove" data-container-id="" data-service-id="${escName}">Remove</button>
            ` : `
              <button class="btn btn-panel btn-container-toggle" data-container-id="${c.Id}" data-service-id="${escName}">${isRunning ? 'Stop' : 'Start'}</button>
              ${isRunning ? `<button class="btn btn-panel btn-container-restart" data-container-id="${c.Id}" data-service-id="${escName}">Restart</button>` : ''}
              ${isRunning ? `<button class="btn btn-panel btn-container-logs" data-container-id="${c.Id}">Logs</button>` : ''}
              <button class="btn btn-panel btn-container-inspect" data-container-id="${c.Id}">Inspect</button>
              <button class="btn btn-panel btn-container-recreate" data-container-id="${c.Id}" data-service-id="${escName}" style="color: var(--text-accent, #60a5fa);">Recreate</button>
              <button class="btn btn-panel danger-btn btn-container-remove" data-container-id="${c.Id}" data-service-id="${escName}">Remove</button>
            `}
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

    target.querySelectorAll('.btn-container-logs').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-container-id');
        try {
          const res = await api.get(`/api/v1/docker/containers/${id}/logs`);
          this.showModal(`Logs Output - Container [${id.substring(0,12)}]`, res.logs || 'No log buffer output captured.');
        } catch (err) {
          alert(`Failed to fetch logs: ${err.message}`);
        }
      });
    });

    target.querySelectorAll('.btn-container-inspect').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-container-id');
        try {
          const res = await api.get(`/api/v1/docker/containers/${id}/inspect`);
          this.showModal(`Inspect Configuration - Container [${id.substring(0,12)}]`, JSON.stringify(res), true);
        } catch (err) {
          alert(`Inspect failed: ${err.message}`);
        }
      });
    });

    target.querySelectorAll('.btn-container-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-container-id');
        const sId = btn.getAttribute('data-service-id');
        const confirmDelete = await Dialog.confirm({
          title: 'Remove Container',
          message: `Are you sure you want to permanently remove container [${sId}]?`
        });
        if (confirmDelete) {
          this.triggerAction(id, sId, 'remove');
        }
      });
    });

    target.querySelectorAll('.btn-container-recreate').forEach(btn => {
      btn.addEventListener('click', async () => {
        const serviceId = btn.getAttribute('data-service-id');
        const confirmRecreate = await Dialog.confirm({
          title: 'Recreate Container',
          message: `This will run docker compose up -d for service [${serviceId}], rebuilding and launching it from its compose definition. Continue?`
        });
        if (confirmRecreate) {
          try {
            const res = await api.post(`/api/v1/services/${serviceId}/compose-up`, {});
            alert(`Compose Up triggered as job: ${res.jobId}`);
            this.loadTabContent();
          } catch (err) {
            alert(`Compose Up failed: ${err.message || err.error || 'Unknown error'}`);
          }
        }
      });
    });

    // Attach Autostart toggles
    target.querySelectorAll('.autostart-toggle').forEach(input => {
      input.addEventListener('change', async () => {
        const id = input.getAttribute('data-container-id');
        const enabled = input.checked;
        this.lastActionTime = Date.now();
        this.isActionInProgress = true;
        try {
          await api.post(`/api/v1/docker/containers/${id}/autostart`, { enabled });
          if (this.cachedList) {
            const match = this.cachedList.find(c => c.Id === id);
            if (match) {
              match.Autostart = enabled;
              match.RestartPolicy = enabled ? 'unless-stopped' : 'no';
              this.cachedSerialized = JSON.stringify(this.cachedList);
            }
          }
        } catch (err) {
          alert(`Failed to update autostart setting: ${err.message}`);
          input.checked = !enabled;
        } finally {
          this.isActionInProgress = false;
        }
      });
    });
  },

  renderImages(target, list) {
    if (list.length === 0) {
      target.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">No images found on Docker host.</div>';
      return;
    }

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
          const res = await api.post('/api/v1/docker/images', { image });
          alert(`Successfully pulled image [${image}]. Job ID: ${res.jobId}`);
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
    if (list.length === 0) {
      target.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">No volumes found on Docker host.</div>';
      return;
    }

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
    if (list.length === 0) {
      target.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">No networks found on Docker host.</div>';
      return;
    }

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
    this.lastActionTime = Date.now();
    this.isActionInProgress = true;
    try {
      const res = await api.post(`/api/v1/services/${serviceId}/action`, { action });
      alert(`Action [${action.toUpperCase()}] triggered as job: ${res.jobId}`);
      this.loadTabContent();
    } catch (err) {
      alert(`Action [${action.toUpperCase()}] failed: ${err.message}`);
    } finally {
      this.isActionInProgress = false;
    }
  },

  showModal(title, contentText, isJson = false) {
    let existing = document.getElementById('container-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'container-detail-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(0,0,0,0.85)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '9999';

    const inner = document.createElement('div');
    inner.style.width = '800px';
    inner.style.maxWidth = '90vw';
    inner.style.height = '550px';
    inner.style.backgroundColor = '#1e293b';
    inner.style.border = '1px solid var(--border-slate)';
    inner.style.borderRadius = '8px';
    inner.style.padding = '1.5rem';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.gap = '1rem';

    const escTitle = this.escapeHtml(title);
    const escContent = this.escapeHtml(contentText);

    inner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:0.75rem;">
        <h3 style="margin:0; font-size:1rem; color:#fff; font-weight:600;">${escTitle}</h3>
        <button class="btn btn-panel" id="modal-close-btn" style="padding:0.25rem 0.5rem; font-size:0.7rem;">Close</button>
      </div>
      <div style="flex:1; overflow-y:auto; background:#000; border-radius:6px; padding:1rem; font-family:'JetBrains Mono', monospace; font-size:0.7rem; color:var(--text-primary); white-space:pre-wrap; border:1px solid rgba(255,255,255,0.05); line-height:1.4;">
        ${escContent}
      </div>
    `;

    modal.appendChild(inner);
    document.body.appendChild(modal);

    modal.querySelector('#modal-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }
};

export default AppContainers;
