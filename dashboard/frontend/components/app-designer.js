// Data-Driven Visual Infrastructure Topology Designer (Bezier Paths & Live Sync)
import { api } from '../core/api.js';

export const AppDesigner = {
  container: null,
  nodes: [],
  links: [],
  selectedNodeId: null,
  pollInterval: null,
  scale: 1.0,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,

  init(containerEl) {
    this.container = containerEl;
    this.selectedNodeId = null;
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.nodes = [];
    this.links = [];

    this.render();
    
    // Initial fetch of states and dynamic updates
    this.refreshLiveTopology();
    this.pollInterval = setInterval(() => this.refreshLiveTopology(), 4000);
    window.activeAppDestroy = () => this.destroy();
  },

  async refreshLiveTopology() {
    await this.loadTopologyData();
    this.renderNodes();
    this.renderConnections();
  },

  async loadTopologyData() {
    try {
      // Fetch dynamic coordinates and status from backend infrastructure service
      this.nodes = await api.get('/api/v1/designer/topology').catch(() => []);
      
      // Parse links dynamically from node connections array
      this.links = [];
      this.nodes.forEach(node => {
        if (node.connections && Array.isArray(node.connections)) {
          node.connections.forEach(targetId => {
            // Verify target exists in nodes list
            if (this.nodes.some(n => n.id === targetId)) {
              this.links.push({
                source: node.id,
                target: targetId
              });
            }
          });
        }
      });
    } catch (err) {
      console.error('Failed to load topology:', err);
    }
  },

  async saveLayout() {
    const layout = {};
    this.nodes.forEach(node => {
      layout[node.id] = node.position || { x: node.x, y: node.y };
    });
    try {
      await api.post('/api/v1/designer/layout', { layout });
    } catch (err) {
      console.error('Failed to save layout coordinates:', err);
    }
  },

  autoLayout() {
    const internet = this.nodes.filter(n => n.type === 'internet');
    const tunnels = this.nodes.filter(n => n.type === 'tunnel');
    const proxies = this.nodes.filter(n => n.type === 'proxy');
    const containers = this.nodes.filter(n => n.type === 'container' || (!['internet', 'tunnel', 'proxy'].includes(n.type)));

    if (internet[0]) internet[0].position = { x: 400, y: 50 };
    tunnels.forEach((t, i) => {
      t.position = { x: 400 + (i - (tunnels.length - 1) / 2) * 200, y: 170 };
    });
    proxies.forEach((p, i) => {
      p.position = { x: 400 + (i - (proxies.length - 1) / 2) * 200, y: 290 };
    });

    const totalContainers = containers.length;
    const spacing = 160;
    const startX = 400 - ((totalContainers - 1) * spacing) / 2;
    containers.forEach((c, i) => {
      c.position = { x: startX + i * spacing, y: 430 };
    });

    // Mirror to visual x/y
    this.nodes.forEach(n => {
      if (n.position) {
        n.x = n.position.x;
        n.y = n.position.y;
      }
    });

    this.saveLayout();
    this.renderNodes();
    this.renderConnections();
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <style>
        @keyframes flow {
          to {
            stroke-dashoffset: -20;
          }
        }
        .flowing-line {
          animation: flow 1.0s linear infinite;
        }
        .designer-node {
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .designer-node:hover {
          box-shadow: 0 0 14px rgba(255,255,255,0.15) !important;
        }
        .designer-node.selected {
          border-color: var(--term-green) !important;
          box-shadow: 0 0 16px var(--term-green) !important;
        }
        .topology-tooltip {
          position: absolute;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid var(--border-slate);
          color: #fff;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.65rem;
          pointer-events: none;
          z-index: 1000;
          display: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
      </style>

      <div class="designer-layout" style="display: flex; flex-direction: column; height: 100%; gap: 1rem; color: var(--text-slate); user-select: none;">
        <div class="designer-toolbar" style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.4); padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-slate); backdrop-filter: blur(10px);">
          <div>
            <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Infrastructure Topology Designer</h2>
            <span style="font-size: 0.7rem; color: var(--text-muted);">Interactive status mapping, connection flow & stack control panel</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-card-act" id="btn-auto-layout" style="background: rgba(255, 255, 255, 0.05); color: #fff;">Auto Align</button>
            <button class="btn btn-card-act" id="btn-fit-screen" style="background: rgba(255, 255, 255, 0.05); color: #fff;">Fit View</button>
            <button class="btn btn-primary" id="btn-deploy-stack" style="background: var(--term-green); border: none; color: #000; font-weight: 600;">Deploy Stack</button>
          </div>
        </div>

        <div style="display: flex; flex: 1; gap: 1rem; min-height: 450px; position: relative;">
          <!-- Left sidebar (Properties Panel) -->
          <div class="designer-sidebar" style="width: 250px; background: rgba(30, 41, 59, 0.3); border-radius: 8px; border: 1px solid var(--border-slate); padding: 0.85rem; display: flex; flex-direction: column; gap: 0.75rem; z-index: 10;">
            <div id="node-config-panel" style="display: none;">
              <span style="font-size: 0.75rem; font-weight: 600; color: #fff; display: block; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.25rem;">Node Properties</span>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: var(--text-muted);">Identifier:</span>
                  <span id="node-prop-id" style="font-family: monospace; font-size: 0.7rem; color: #fff;"></span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: var(--text-muted);">Type:</span>
                  <span id="node-prop-type" style="text-transform: uppercase; font-size: 0.65rem; color: #fff;"></span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: var(--text-muted);">Status:</span>
                  <span id="node-prop-status-badge" style="font-size: 0.6rem; font-weight: 700; border: 1px solid #fff; padding: 0.1rem 0.3rem; border-radius: 4px;"></span>
                </div>

                <div id="container-control-actions" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.4rem;">
                  <button class="btn btn-primary btn-action-trigger" data-action="start" style="background: var(--term-green); border: none; color: #000; font-size: 0.7rem; font-weight: 600; padding: 0.35rem;">Start Container</button>
                  <button class="btn btn-card-act btn-action-trigger" data-action="stop" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fff; font-size: 0.7rem; font-weight: 600; padding: 0.35rem;">Stop Container</button>
                  <button class="btn btn-card-act btn-action-trigger" data-action="restart" style="font-size: 0.7rem; padding: 0.35rem; background: rgba(255,255,255,0.05);">Restart</button>
                </div>
              </div>
            </div>
            
            <div id="no-selected-panel" style="font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">
              Click on a node in the topology view to configure properties and trigger live container controls.
            </div>
          </div>

          <!-- Canvas container -->
          <div class="designer-canvas" id="canvas-area" style="flex: 1; background: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 20px 20px; border-radius: 8px; border: 1px solid var(--border-slate); position: relative; overflow: hidden; min-height: 400px; cursor: grab;">
            <div id="canvas-transform-wrapper" style="position: absolute; top:0; left:0; width:100%; height:100%; transform-origin: 0 0;">
              <svg id="canvas-connections" style="position: absolute; top:0; left:0; width:3000px; height:3000px; pointer-events:none; z-index: 1;"></svg>
              <div id="nodes-container" style="position: absolute; top:0; left:0; width:3000px; height:3000px; z-index: 2;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="topology-tooltip" id="designer-tooltip"></div>
    `;

    this.bindCanvasEvents();
    this.bindToolbarEvents();
  },

  renderNodes() {
    const container = this.container.querySelector('#nodes-container');
    if (!container) return;
    
    // Clear old elements but keep selected if valid
    const selectedNodeId = this.selectedNodeId;
    container.innerHTML = '';

    this.nodes.forEach(node => {
      // Map node position defaults if not set
      if (!node.position) {
        node.position = { x: 100, y: 100 };
      }
      node.x = node.position.x;
      node.y = node.position.y;

      const nodeEl = document.createElement('div');
      nodeEl.className = `designer-node node-${node.type} ${selectedNodeId === node.id ? 'selected' : ''}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
      nodeEl.style.position = 'absolute';
      nodeEl.style.width = '150px';
      nodeEl.style.height = '50px';
      nodeEl.style.borderRadius = '8px';
      nodeEl.style.cursor = 'move';
      nodeEl.style.userSelect = 'none';
      nodeEl.style.display = 'flex';
      nodeEl.style.flexDirection = 'column';
      nodeEl.style.justifyContent = 'center';
      nodeEl.style.alignItems = 'center';
      nodeEl.style.textAlign = 'center';

      let border = '1px solid var(--border-slate)';
      let bg = 'rgba(30, 41, 59, 0.95)';
      if (node.type === 'internet') { border = '1px solid #3b82f6'; bg = 'rgba(59, 130, 246, 0.15)'; }
      else if (node.type === 'tunnel') { border = '1px solid #f97316'; bg = 'rgba(249, 115, 22, 0.15)'; }
      else if (node.type === 'proxy') { border = '1px solid #a855f7'; bg = 'rgba(168, 85, 247, 0.15)'; }
      else if (node.type === 'container') { border = '1px solid var(--term-green)'; bg = 'rgba(34, 197, 94, 0.12)'; }

      nodeEl.style.border = border;
      nodeEl.style.background = bg;
      nodeEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';

      // Show real state colors
      const isOnline = node.status === 'online';
      const isOffline = node.status === 'offline';
      let dotColor = '#64748b'; // unknown
      if (isOnline) dotColor = 'var(--term-green)';
      else if (isOffline) dotColor = '#ef4444';

      let statusDot = `<span class="status-indicator-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; position: absolute; top: 8px; right: 8px; box-shadow: 0 0 6px ${dotColor};"></span>`;

      nodeEl.innerHTML = `
        ${statusDot}
        <div style="font-weight: 700; font-size: 0.75rem; color: #fff; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${node.name}</div>
        <div style="font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; font-weight: 600;">${node.type}</div>
      `;

      nodeEl.setAttribute('data-id', node.id);
      container.appendChild(nodeEl);

      this.makeDraggable(nodeEl, node);
      this.bindNodeTooltip(nodeEl, node);
    });
  },

  renderConnections() {
    const svg = this.container.querySelector('#canvas-connections');
    if (!svg) return;
    svg.innerHTML = '';

    this.links.forEach(link => {
      const sourceNode = this.nodes.find(n => n.id === link.source);
      const targetNode = this.nodes.find(n => n.id === link.target);

      if (sourceNode && targetNode) {
        // Center offsets for 150x50 nodes
        const x1 = sourceNode.x + 75;
        const y1 = sourceNode.y + 25;
        const x2 = targetNode.x + 75;
        const y2 = targetNode.y + 25;

        // Determine path properties based on statuses
        const sOnline = sourceNode.status === 'online';
        const tOnline = targetNode.status === 'online';
        const sOffline = sourceNode.status === 'offline';
        const tOffline = targetNode.status === 'offline';

        let color = '#64748b'; // Gray dotted for unknown
        let dasharray = '3, 4';
        let width = '2.5';
        let opacity = '0.5';
        let activeFlow = false;

        if (sOnline && tOnline) {
          color = 'var(--term-green)'; // Green solid for connected path
          dasharray = 'none';
          width = '3.5';
          opacity = '0.9';
          activeFlow = true;
        } else if (sOffline || tOffline) {
          color = '#ef4444'; // Red dashed for offline broken route
          dasharray = '6, 6';
          width = '3.5';
          opacity = '0.8';
        }

        // Draw S-curve (Cubic Bezier curve running vertical-wards)
        const pathData = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;

        // Create main path line
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', width);
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', opacity);
        if (dasharray !== 'none') {
          path.setAttribute('stroke-dasharray', dasharray);
        }
        svg.appendChild(path);

        // Overlay glowing animation for active paths
        if (activeFlow) {
          const flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          flowPath.setAttribute('d', pathData);
          flowPath.setAttribute('stroke', '#34d399');
          flowPath.setAttribute('stroke-width', '4');
          flowPath.setAttribute('fill', 'none');
          flowPath.setAttribute('class', 'flowing-line');
          flowPath.setAttribute('stroke-dasharray', '6, 18');
          flowPath.setAttribute('stroke-linecap', 'round');
          flowPath.setAttribute('opacity', '1');
          svg.appendChild(flowPath);
        }
      }
    });
  },

  makeDraggable(el, node) {
    let startX = 0, startY = 0;

    const dragStart = (e) => {
      e.stopPropagation();
      this.selectedNodeId = node.id;
      this.updateSelectedCard(node);

      startX = e.clientX - node.x;
      startY = e.clientY - node.y;

      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
    };

    const dragMove = (e) => {
      node.x = e.clientX - startX;
      node.y = e.clientY - startY;

      node.position = { x: node.x, y: node.y };

      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      this.renderConnections();
    };

    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      this.saveLayout();
    };

    el.addEventListener('mousedown', dragStart);
  },

  bindNodeTooltip(el, node) {
    const tooltip = this.container.querySelector('#designer-tooltip');
    if (!tooltip) return;

    el.addEventListener('mouseenter', (e) => {
      tooltip.style.display = 'block';
      tooltip.innerHTML = `
        <div style="font-weight:700; color:#fff; font-size:0.75rem;">${node.name}</div>
        <div style="font-size:0.6rem; color:var(--text-muted); text-transform:uppercase; margin-top:2px;">Type: ${node.type}</div>
        <div style="font-size:0.6rem; color:${node.status === 'online' ? 'var(--term-green)' : '#ef4444'}; margin-top:2px; font-weight:700;">Status: ${node.status.toUpperCase()}</div>
      `;
    });

    el.addEventListener('mousemove', (e) => {
      const rect = this.container.querySelector('#canvas-area').getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 15}px`;
      tooltip.style.top = `${e.clientY - rect.top + 15}px`;
    });

    el.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  },

  updateSelectedCard(node) {
    const configPanel = this.container.querySelector('#node-config-panel');
    const noSelected = this.container.querySelector('#no-selected-panel');
    if (!configPanel || !noSelected) return;

    noSelected.style.display = 'none';
    configPanel.style.display = 'block';

    configPanel.querySelector('#node-prop-id').textContent = node.id;
    configPanel.querySelector('#node-prop-type').textContent = node.type;

    const badge = configPanel.querySelector('#node-prop-status-badge');
    badge.textContent = node.status.toUpperCase();
    badge.style.color = node.status === 'online' ? 'var(--term-green)' : '#ef4444';
    badge.style.borderColor = node.status === 'online' ? 'var(--term-green)' : '#ef4444';

    // Show action trigger tools only if type is tunnel or container
    const actionsSection = configPanel.querySelector('#container-control-actions');
    if (['tunnel', 'proxy', 'container'].includes(node.type)) {
      actionsSection.style.display = 'flex';
    } else {
      actionsSection.style.display = 'none';
    }

    // Unselect other nodes visually
    this.container.querySelectorAll('.designer-node').forEach(el => {
      if (el.getAttribute('data-id') === node.id) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  },

  bindCanvasEvents() {
    const canvas = this.container.querySelector('#canvas-area');
    const wrapper = this.container.querySelector('#canvas-transform-wrapper');
    if (!canvas || !wrapper) return;

    // Pan canvas via drag background
    canvas.addEventListener('mousedown', (e) => {
      if (e.target !== canvas && e.target.id !== 'canvas-connections') return;
      this.isPanning = true;
      canvas.style.cursor = 'grabbing';
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      wrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        canvas.style.cursor = 'grab';
      }
    });

    // Zoom canvas via wheel scroll
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        this.scale = Math.min(2.0, this.scale * zoomFactor);
      } else {
        this.scale = Math.max(0.5, this.scale / zoomFactor);
      }
      wrapper.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }, { passive: false });
  },

  bindToolbarEvents() {
    const autoBtn = this.container.querySelector('#btn-auto-layout');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => this.autoLayout());
    }

    const fitBtn = this.container.querySelector('#btn-fit-screen');
    if (fitBtn) {
      fitBtn.addEventListener('click', () => {
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        const wrapper = this.container.querySelector('#canvas-transform-wrapper');
        if (wrapper) {
          wrapper.style.transform = `translate(0px, 0px) scale(1)`;
        }
      });
    }

    const deployBtn = this.container.querySelector('#btn-deploy-stack');
    if (deployBtn) {
      deployBtn.addEventListener('click', async () => {
        try {
          deployBtn.textContent = 'Deploying...';
          deployBtn.disabled = true;
          const res = await api.post('/api/v1/designer/deploy', {
            nodes: this.nodes,
            links: this.links
          });
          alert(`Asynchronous deploy job created: ${res.jobId}. Monitor status in the Job Center.`);
          this.refreshLiveTopology();
        } catch (err) {
          alert(`Deploy failed: ${err.message}`);
        } finally {
          deployBtn.textContent = 'Deploy Stack';
          deployBtn.disabled = false;
        }
      });
    }

    // Bind action control panel buttons
    this.container.querySelectorAll('.btn-action-trigger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        const nodeId = this.selectedNodeId;
        if (!nodeId) return;

        btn.disabled = true;
        try {
          const res = await api.post(`/api/v1/services/${nodeId}/action`, { action });
          alert(`Operational job [${action.toUpperCase()}] queued: ${res.jobId}`);
          this.refreshLiveTopology();
        } catch (err) {
          alert(`Action failed: ${err.message}`);
        } finally {
          btn.disabled = false;
        }
      });
    });
  },

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
};

export default AppDesigner;
