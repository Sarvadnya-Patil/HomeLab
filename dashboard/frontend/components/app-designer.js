// Visual Infrastructure Topology Designer Component
import { api } from '../core/api.js';

export const AppDesigner = {
  container: null,
  nodes: [],
  links: [],
  selectedNodeId: null,
  isConnecting: false,
  connectSourceId: null,

  init(containerEl) {
    this.container = containerEl;
    this.nodes = [
      { id: 'n1', type: 'internet', name: 'Internet', x: 50, y: 150, config: {} },
      { id: 'n2', type: 'tunnel', name: 'Cloudflare Tunnel', x: 220, y: 150, config: { token: 'ey...' } },
      { id: 'n3', type: 'proxy', name: 'Nginx Proxy Manager', x: 400, y: 150, config: {} }
    ];
    this.links = [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' }
    ];
    this.render();
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="designer-layout" style="display: flex; flex-direction: column; height: 100%; gap: 1rem; color: var(--text-slate);">
        <div class="designer-toolbar" style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.4); padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-slate); backdrop-filter: blur(10px);">
          <div>
            <h2 style="margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600;">Visual Infrastructure Topology Designer</h2>
            <span style="font-size: 0.7rem; color: var(--text-muted);">Drag, connect, and compile network compose configurations</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-card-act" id="btn-conn-mode" style="background: ${this.isConnecting ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)'};">
              ${this.isConnecting ? 'Connection Mode: ON' : 'Link Connection'}
            </button>
            <button class="btn btn-primary" id="btn-deploy-stack" style="background: var(--term-green); border: none; color: #000; font-weight: 600;">Deploy Custom Stack</button>
          </div>
        </div>

        <div style="display: flex; flex: 1; gap: 1rem; min-height: 450px;">
          <!-- Node Creator Panel -->
          <div class="designer-sidebar" style="width: 220px; background: rgba(30, 41, 59, 0.3); border-radius: 8px; border: 1px solid var(--border-slate); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <span style="font-size: 0.75rem; font-weight: 600; color: #fff;">Topology Elements</span>
            <button class="btn btn-card-act add-node-btn" data-type="container" style="text-align: left; padding: 0.5rem;">+ Add Container</button>
            <button class="btn btn-card-act add-node-btn" data-type="network" style="text-align: left; padding: 0.5rem;">+ Add network</button>
            <button class="btn btn-card-act add-node-btn" data-type="volume" style="text-align: left; padding: 0.5rem;">+ Add Volume</button>
            
            <div id="node-config-panel" style="margin-top: 1rem; border-top: 1px dashed var(--border-slate); padding-top: 1rem; display: none;">
              <span style="font-size: 0.75rem; font-weight: 600; color: #fff; display: block; margin-bottom: 0.5rem;">Node Properties</span>
              <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                <label style="font-size: 0.65rem;">Name</label>
                <input type="text" id="node-prop-name" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.25rem; border-radius: 4px; font-size: 0.75rem;">
                
                <div id="container-props-only">
                  <label style="font-size: 0.65rem; display: block; margin-top: 0.25rem;">Docker Image</label>
                  <input type="text" id="node-prop-image" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.25rem; border-radius: 4px; font-size: 0.75rem;">
                  <label style="font-size: 0.65rem; display: block; margin-top: 0.25rem;">Host Port</label>
                  <input type="number" id="node-prop-port" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-slate); color: #fff; padding: 0.25rem; border-radius: 4px; font-size: 0.75rem;">
                </div>

                <button class="btn btn-card-act" id="btn-save-props" style="margin-top: 0.5rem; background: var(--border-slate);">Save Node</button>
                <button class="btn btn-card-act" id="btn-del-node" style="background: #ef4444; color: #fff; border: none; margin-top: 0.25rem;">Delete Node</button>
              </div>
            </div>
          </div>

          <!-- Canvas Workspace -->
          <div class="designer-canvas" id="canvas-area" style="flex: 1; background: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 20px 20px; border-radius: 8px; border: 1px solid var(--border-slate); position: relative; overflow: hidden; min-height: 400px;">
            <svg id="canvas-connections" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index: 1;"></svg>
            <div id="nodes-container" style="position: absolute; top:0; left:0; width:100%; height:100%; z-index: 2;"></div>
          </div>
        </div>
      </div>
    `;

    this.renderNodes();
    this.renderConnections();
    this.bindEvents();
  },

  renderNodes() {
    const container = this.container.querySelector('#nodes-container');
    if (!container) return;
    container.innerHTML = '';

    this.nodes.forEach(node => {
      const nodeEl = document.createElement('div');
      nodeEl.className = `designer-node node-${node.type} ${this.selectedNodeId === node.id ? 'selected' : ''}`;
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
      nodeEl.style.position = 'absolute';
      nodeEl.style.padding = '0.5rem 0.75rem';
      nodeEl.style.borderRadius = '6px';
      nodeEl.style.cursor = 'move';
      nodeEl.style.minWidth = '120px';
      nodeEl.style.userSelect = 'none';

      // Design styling based on node type
      let border = '1px solid var(--border-slate)';
      let bg = 'rgba(30, 41, 59, 0.9)';
      if (node.type === 'internet') { border = '1px solid #3b82f6'; bg = 'rgba(59, 130, 246, 0.2)'; }
      else if (node.type === 'tunnel') { border = '1px solid #f97316'; bg = 'rgba(249, 115, 22, 0.2)'; }
      else if (node.type === 'proxy') { border = '1px solid #a855f7'; bg = 'rgba(168, 85, 247, 0.2)'; }
      else if (node.type === 'container') { border = '1px solid var(--term-green)'; bg = 'rgba(34, 197, 94, 0.15)'; }
      else if (node.type === 'network') { border = '1px solid #eab308'; bg = 'rgba(234, 179, 8, 0.15)'; }
      else if (node.type === 'volume') { border = '1px solid #06b6d4'; bg = 'rgba(6, 182, 212, 0.15)'; }

      nodeEl.style.border = border;
      nodeEl.style.background = bg;
      nodeEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';

      nodeEl.innerHTML = `
        <div style="font-weight: 600; font-size: 0.75rem; color: #fff;">${node.name}</div>
        <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">${node.type}</div>
      `;

      nodeEl.setAttribute('data-id', node.id);
      container.appendChild(nodeEl);

      // Node dragging physics
      this.makeDraggable(nodeEl, node);
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
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        // Compute node center offsets
        line.setAttribute('x1', String(sourceNode.x + 60));
        line.setAttribute('y1', String(sourceNode.y + 20));
        line.setAttribute('x2', String(targetNode.x + 60));
        line.setAttribute('y2', String(targetNode.y + 20));
        line.setAttribute('stroke', 'var(--border-slate)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '4, 4');
        svg.appendChild(line);
      }
    });
  },

  makeDraggable(el, node) {
    let startX = 0, startY = 0;

    const dragStart = (e) => {
      e.stopPropagation();
      if (this.isConnecting) {
        this.handleConnectingClick(node.id);
        return;
      }

      this.selectedNodeId = node.id;
      this.renderNodeConfigPanel(node);

      startX = e.clientX - node.x;
      startY = e.clientY - node.y;

      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
    };

    const dragMove = (e) => {
      node.x = e.clientX - startX;
      node.y = e.clientY - startY;

      // Keep boundaries inside canvas
      node.x = Math.max(0, Math.min(node.x, 800));
      node.y = Math.max(0, Math.min(node.y, 600));

      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      this.renderConnections();
    };

    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
    };

    el.addEventListener('mousedown', dragStart);
  },

  handleConnectingClick(nodeId) {
    if (!this.connectSourceId) {
      this.connectSourceId = nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      alert(`Source node selected: ${node.name}. Click target node next.`);
    } else {
      if (this.connectSourceId === nodeId) {
        this.connectSourceId = null;
        this.isConnecting = false;
        this.render();
        return;
      }

      // Add connection link
      this.links.push({ source: this.connectSourceId, target: nodeId });
      this.connectSourceId = null;
      this.isConnecting = false;
      this.render();
    }
  },

  renderNodeConfigPanel(node) {
    const panel = this.container.querySelector('#node-config-panel');
    if (!panel) return;
    panel.style.display = 'block';

    const nameInput = panel.querySelector('#node-prop-name');
    nameInput.value = node.name;

    const containerSection = panel.querySelector('#container-props-only');
    if (node.type === 'container') {
      containerSection.style.display = 'block';
      panel.querySelector('#node-prop-image').value = node.config.image || 'nginx:alpine';
      panel.querySelector('#node-prop-port').value = node.config.port || '80';
    } else {
      containerSection.style.display = 'none';
    }
  },

  bindEvents() {
    // Save properties
    const saveBtn = this.container.querySelector('#btn-save-props');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const node = this.nodes.find(n => n.id === this.selectedNodeId);
        if (node) {
          node.name = this.container.querySelector('#node-prop-name').value;
          if (node.type === 'container') {
            node.config.image = this.container.querySelector('#node-prop-image').value;
            node.config.port = Number(this.container.querySelector('#node-prop-port').value);
          }
          this.render();
        }
      });
    }

    // Delete node
    const delBtn = this.container.querySelector('#btn-del-node');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (confirm('Delete selected topology node?')) {
          this.nodes = this.nodes.filter(n => n.id !== this.selectedNodeId);
          this.links = this.links.filter(l => l.source !== this.selectedNodeId && l.target !== this.selectedNodeId);
          this.selectedNodeId = null;
          this.render();
        }
      });
    }

    // Connection mode toggler
    const connBtn = this.container.querySelector('#btn-conn-mode');
    if (connBtn) {
      connBtn.addEventListener('click', () => {
        this.isConnecting = !this.isConnecting;
        this.connectSourceId = null;
        this.render();
      });
    }

    // Node Creator element button triggers
    this.container.querySelectorAll('.add-node-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const count = this.nodes.filter(n => n.type === type).length + 1;
        const newNode = {
          id: `n${Date.now()}`,
          type,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 200,
          config: type === 'container' ? { image: 'nginx:alpine', port: 80 } : {}
        };
        this.nodes.push(newNode);
        this.selectedNodeId = newNode.id;
        this.render();
      });
    });

    // Deploy infrastructure compile trigger
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
          alert(`Deploy triggered successfully. Asynchronous Job ID: ${res.jobId}. Monitor status in the Job Center.`);
          this.render();
        } catch (err) {
          alert(`Deploy failed: ${err.message}`);
          deployBtn.textContent = 'Deploy Custom Stack';
          deployBtn.disabled = false;
        }
      });
    }
  }
};
export default AppDesigner;
