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
    this.isDragging = false;
    this.isLoading = true;
    this.localPositions = new Map();

    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar) {
      this.onSearchInput = () => {
        this.renderConnections();
      };
      mainSearchBar.addEventListener('input', this.onSearchInput);
    }

    this.render();
    
    // Initial fetch of states and dynamic updates
    this.refreshLiveTopology(true);
    this.pollInterval = setInterval(() => this.refreshLiveTopology(false), 4000);
    window.activeAppDestroy = () => this.destroy();
  },

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    const mainSearchBar = document.getElementById("cmd-palette");
    if (mainSearchBar && this.onSearchInput) {
      mainSearchBar.removeEventListener('input', this.onSearchInput);
    }
  },

  async refreshLiveTopology(isInitial = false) {
    if (this.isDragging) return;
    await this.loadTopologyData();
    this.isLoading = false;
    this.renderNodes();
    this.renderConnections();
    if (isInitial) {
      setTimeout(() => this.fitView(), 50);
    }
  },

  async loadTopologyData() {
    try {
      // Fetch dynamic coordinates and status from backend infrastructure service
      const fetchedNodes = await api.get('/api/v1/designer/topology').catch(() => []);
      
      // Preserve local coordinates if a drag-and-save cycle is pending in database
      fetchedNodes.forEach(node => {
        const localPos = this.localPositions ? this.localPositions.get(node.id) : null;
        if (localPos) {
          const targetPos = node.position || { x: node.x, y: node.y };
          if (Math.abs(targetPos.x - localPos.x) < 2 && Math.abs(targetPos.y - localPos.y) < 2) {
            this.localPositions.delete(node.id);
          } else {
            node.position = localPos;
          }
        }
      });

      this.nodes = fetchedNodes;
      
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
    const canvas = this.container.querySelector('#canvas-area');
    const canvasWidth = canvas ? canvas.clientWidth : 800;
    const canvasHeight = canvas ? canvas.clientHeight : 450;
    const centerX = canvasWidth / 2;

    const internet = this.nodes.filter(n => n.type === 'internet');
    const tunnels = this.nodes.filter(n => n.type === 'tunnel');
    const proxies = this.nodes.filter(n => n.type === 'proxy');
    const containers = this.nodes.filter(n => n.type === 'container' || (!['internet', 'tunnel', 'proxy'].includes(n.type)));

    const hasProxy = proxies.length > 0;

    // Distribute vertically inside the available canvas height with padding bounds
    const yInternet = Math.round(canvasHeight * 0.12);
    const yTunnel = Math.round(canvasHeight * 0.38);
    const yProxy = Math.round(canvasHeight * 0.62);
    const yContainer = Math.round(canvasHeight * 0.82);

    if (internet[0]) internet[0].position = { x: centerX - 75, y: yInternet };
    
    tunnels.forEach((t, i) => {
      t.position = { x: centerX - 75 + (i - (tunnels.length - 1) / 2) * 180, y: yTunnel };
    });
    
    if (hasProxy) {
      proxies.forEach((p, i) => {
        p.position = { x: centerX - 75 + (i - (proxies.length - 1) / 2) * 180, y: yProxy };
      });
    }

    const totalContainers = containers.length;
    const spacing = 170;
    const startX = centerX - 75 - ((totalContainers - 1) * spacing) / 2;
    const targetY = hasProxy ? yContainer : yProxy;

    containers.forEach((c, i) => {
      c.position = { x: startX + i * spacing, y: targetY };
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
    this.fitView();
  },

  fitView() {
    const canvas = this.container.querySelector('#canvas-area');
    const wrapper = this.container.querySelector('#canvas-transform-wrapper');
    if (!canvas || !wrapper || this.nodes.length === 0) return;

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 150);
      maxY = Math.max(maxY, n.y + 50);
    });

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    
    const padding = 30;
    const paddedWidth = graphWidth + padding * 2;
    const paddedHeight = graphHeight + padding * 2;

    // Compute best scale fit
    let newScale = Math.min(
      canvasWidth / paddedWidth,
      canvasHeight / paddedHeight
    );
    newScale = Math.max(0.4, Math.min(newScale, 1.1));

    // Center layout coordinates
    const graphCenterX = minX + graphWidth / 2;
    const graphCenterY = minY + graphHeight / 2;

    const newPanX = canvasWidth / 2 - graphCenterX * newScale;
    const newPanY = canvasHeight / 2 - graphCenterY * newScale;

    this.scale = newScale;
    this.panX = newPanX;
    this.panY = newPanY;

    wrapper.style.transform = `translate(${newPanX}px, ${newPanY}px) scale(${newScale})`;
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
          position: fixed;
          background: #000000 !important;
          border: 2px solid #ffffff !important;
          color: #ffffff !important;
          padding: 0.65rem 0.9rem !important;
          border-radius: 0 !important;
          font-size: 0.65rem !important;
          font-family: var(--font-mono) !important;
          pointer-events: none;
          z-index: 9999;
          display: none;
          box-shadow: 3px 3px 0 #ffffff !important;
        }
      </style>

      <div class="designer-layout" style="display: flex; flex-direction: column; height: 100%; gap: 1.25rem; color: #ffffff; user-select: none; font-family: var(--font-mono);">
        <div class="designer-toolbar" style="display: flex; justify-content: space-between; align-items: center; background: #0d0d10; padding: 0.85rem 1.25rem; border-radius: 0; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff;">
          <div>
            <h2 style="margin: 0; font-size: 1rem; color: #ffffff; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;">TOPOLOGY ENGINE MATRIX</h2>
            <span style="font-size: 0.68rem; color: #a1a1aa; font-family: var(--font-mono);">Interactive status mapping, connection flow & stack control panel</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-panel" id="btn-auto-layout" style="background: #000000; color: #ffffff; border: 1px solid #ffffff; font-size: 0.68rem; font-weight: 900; text-transform: uppercase; padding: 0.35rem 0.75rem;">AUTO ALIGN</button>
            <button class="btn btn-panel" id="btn-fit-screen" style="background: #000000; color: #ffffff; border: 1px solid #ffffff; font-size: 0.68rem; font-weight: 900; text-transform: uppercase; padding: 0.35rem 0.75rem;">FIT VIEW</button>
            <button class="btn btn-primary" id="btn-deploy-stack" style="background: #ffffff; color: #000000; border: 2px solid #ffffff; font-size: 0.68rem; font-weight: 900; text-transform: uppercase; padding: 0.35rem 0.85rem; box-shadow: 3px 3px 0 #888888;">DEPLOY STACK</button>
          </div>
        </div>

        <div style="display: flex; flex: 1; gap: 1.25rem; min-height: 450px; position: relative;">
          <!-- Left sidebar (Properties Panel) -->
          <div class="designer-sidebar" style="width: 260px; background: #0e0e11; border-radius: 0; border: 2px solid #ffffff; box-shadow: 4px 4px 0 #ffffff; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; z-index: 10;">
            <div id="node-config-panel" style="display: none;">
              <span style="font-size: 0.8rem; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 0.75rem; border-bottom: 2px solid #ffffff; padding-bottom: 0.4rem;">NODE PROPERTIES</span>
              <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase;">Identifier:</span>
                  <span id="node-prop-id" style="font-family: var(--font-mono); font-size: 0.7rem; color: #ffffff; font-weight: 800;"></span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase;">Type:</span>
                  <span id="node-prop-type" style="text-transform: uppercase; font-size: 0.65rem; color: #ffffff; font-weight: 900;"></span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase;">Status:</span>
                  <span id="node-prop-status-badge" style="font-size: 0.6rem; font-weight: 900; border: 1px solid #ffffff; padding: 0.15rem 0.45rem; border-radius: 0; text-transform: uppercase;"></span>
                </div>

                <div id="container-control-actions" style="margin-top: 1.25rem; display: flex; flex-direction: column; gap: 0.45rem;">
                  <button class="btn btn-primary btn-action-trigger" data-action="start" style="background: #ffffff; border: 2px solid #ffffff; color: #000000; font-size: 0.7rem; font-weight: 900; padding: 0.45rem; text-transform: uppercase; box-shadow: 3px 3px 0 #888888;">START CONTAINER</button>
                  <button class="btn btn-card-act btn-action-trigger" data-action="stop" style="background: #ef4444; border: 2px solid #ef4444; color: #ffffff; font-size: 0.7rem; font-weight: 900; padding: 0.45rem; text-transform: uppercase;">STOP CONTAINER</button>
                  <button class="btn btn-card-act btn-action-trigger" data-action="restart" style="font-size: 0.7rem; padding: 0.45rem; background: #000000; border: 1px solid #ffffff; color: #ffffff; font-weight: 900; text-transform: uppercase;">RESTART</button>
                </div>
              </div>
            </div>
            
            <div id="no-selected-panel" style="font-size: 0.72rem; color: #a1a1aa; text-align: center; margin-top: 2rem; font-family: var(--font-mono); font-weight: 800; text-transform: uppercase; line-height: 1.5;">
              Select a node in the topology canvas to inspect properties and execute controls.
            </div>
          </div>

          <!-- Canvas container -->
          <div class="designer-canvas" id="canvas-area" style="flex: 1; background-color: #050505; background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 20px 20px; border-radius: 0; border: 2px solid #ffffff; box-shadow: 6px 6px 0 #ffffff; position: relative; overflow: hidden; min-height: 400px; cursor: grab;">
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

    if (!this.nodes || this.nodes.length === 0) {
      if (this.isLoading) {
        container.innerHTML = `
          <div class="circular-loader-overlay" style="position: absolute; top: 30%; left: 0; right: 0;">
            <div class="circular-spinner"></div>
            <span class="circular-loader-text">MAPPING TOPOLOGY NODES...</span>
          </div>
        `;
      } else {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding-top: 150px; width: 100%; font-weight: 500;">No topology discovered.</div>`;
      }
      return;
    }

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
      nodeEl.style.width = '170px';
      nodeEl.style.height = '52px';
      nodeEl.style.borderRadius = '0';
      nodeEl.style.cursor = 'move';
      nodeEl.style.userSelect = 'none';
      nodeEl.style.display = 'flex';
      nodeEl.style.flexDirection = 'column';
      nodeEl.style.justifyContent = 'center';
      nodeEl.style.alignItems = 'center';
      nodeEl.style.textAlign = 'center';
      nodeEl.style.border = '2px solid #ffffff';
      nodeEl.style.background = selectedNodeId === node.id ? '#ffffff' : '#0e0e11';
      nodeEl.style.boxShadow = selectedNodeId === node.id ? '5px 5px 0 #ffffff' : '3px 3px 0 #ffffff';
      nodeEl.style.fontFamily = 'var(--font-mono)';

      // Show real state colors
      const isOnline = node.status === 'online';
      const isOffline = node.status === 'offline';
      let dotColor = '#a1a1aa'; // unknown
      if (isOnline) dotColor = '#22c55e';
      else if (isOffline) dotColor = '#ef4444';

      let statusDot = `<span class="status-indicator-dot" style="width: 7px; height: 7px; border-radius: 50% !important; background: ${dotColor}; position: absolute; top: 7px; right: 7px; box-shadow: 0 0 6px ${dotColor}; z-index: 3;"></span>`;
      const isSelected = selectedNodeId === node.id;

      nodeEl.style.padding = '0 18px 0 8px';
      nodeEl.style.boxSizing = 'border-box';

      nodeEl.innerHTML = `
        ${statusDot}
        <div class="node-title" style="font-weight: 900; font-size: 0.72rem; color: ${isSelected ? '#000000' : '#ffffff'}; max-width: 125px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono);">${node.name}</div>
        <div class="node-type-label" style="font-size: 0.55rem; color: ${isSelected ? '#33333e' : '#a1a1aa'}; text-transform: uppercase; margin-top: 2px; font-weight: 800; font-family: var(--font-mono);">${node.type}</div>
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

    const searchVal = (document.getElementById("cmd-palette")?.value || '').toLowerCase().trim();

    // Trace path to matching container nodes
    const nodesOnPath = new Set();
    if (searchVal) {
      const matchingContainerIds = this.nodes
        .filter(n => n.type === 'container' && (
          n.name.toLowerCase().includes(searchVal) ||
          n.id.toLowerCase().includes(searchVal)
        ))
        .map(n => n.id);

      matchingContainerIds.forEach(id => nodesOnPath.add(id));

      if (matchingContainerIds.length > 0) {
        let added = true;
        while (added) {
          added = false;
          this.links.forEach(link => {
            if (nodesOnPath.has(link.target) && !nodesOnPath.has(link.source)) {
              nodesOnPath.add(link.source);
              added = true;
            }
          });
        }
      }
    }

    this.links.forEach(link => {
      const sourceNode = this.nodes.find(n => n.id === link.source);
      const targetNode = this.nodes.find(n => n.id === link.target);

      if (sourceNode && targetNode) {
        let x1 = sourceNode.x + 85;
        let y1 = sourceNode.y + 26;
        let x2 = targetNode.x + 85;
        let y2 = targetNode.y + 26;

        // Calculate boundary anchor points dynamically
        const dy = targetNode.y - sourceNode.y;
        const dx = targetNode.x - sourceNode.x;
        const isVertical = Math.abs(dy) >= Math.abs(dx);

        if (isVertical) {
          if (dy > 0) {
            y1 = sourceNode.y + 52; // Bottom edge
            y2 = targetNode.y;      // Top edge
          } else {
            y1 = sourceNode.y;      // Top edge
            y2 = targetNode.y + 52; // Bottom edge
          }
        } else {
          if (dx > 0) {
            x1 = sourceNode.x + 170; // Right edge
            x2 = targetNode.x;       // Left edge
          } else {
            x1 = sourceNode.x;       // Left edge
            x2 = targetNode.x + 170; // Right edge
          }
        }

        // Determine if this path matches the global search query path
        const queryMatches = searchVal && nodesOnPath.has(link.source) && nodesOnPath.has(link.target);

        // Determine path properties based on statuses
        const sOnline = sourceNode.status === 'online';
        const tOnline = targetNode.status === 'online';
        const sOffline = sourceNode.status === 'offline';
        const tOffline = targetNode.status === 'offline';

        let color = '#a1a1aa'; // Gray dotted for unknown
        let dasharray = '3, 4';
        let width = '2.5';
        let opacity = '0.6';
        let activeFlow = false;

        if (sOnline && tOnline) {
          color = queryMatches ? '#3b82f6' : '#22c55e'; // Blue if matches query, otherwise Green
          dasharray = 'none';
          width = '3.5';
          opacity = '0.9';
          activeFlow = true;
        } else if (sOffline || tOffline) {
          color = queryMatches ? '#3b82f6' : '#ef4444'; // Blue if matches query, otherwise Red
          dasharray = '6, 6';
          width = '3.5';
          opacity = '0.8';
        }

        // Calculate smooth Bezier curve based on orientation
        let pathData = '';
        if (isVertical) {
          const cy1 = y1 + (dy > 0 ? 35 : -35);
          const cy2 = y2 + (dy > 0 ? -35 : 35);
          pathData = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
        } else {
          const cx1 = x1 + (dx > 0 ? 35 : -35);
          const cx2 = x2 + (dx > 0 ? -35 : 35);
          pathData = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
        }

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
          flowPath.setAttribute('stroke', queryMatches ? '#60a5fa' : '#34d399');
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
      this.isDragging = true;

      startX = e.clientX - node.x;
      startY = e.clientY - node.y;

      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
    };

    const dragMove = (e) => {
      node.x = e.clientX - startX;
      node.y = e.clientY - startY;

      node.position = { x: node.x, y: node.y };
      if (this.localPositions) {
        this.localPositions.set(node.id, node.position);
      }

      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      this.renderConnections();
    };

    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      this.isDragging = false;
      this.saveLayout();
    };

    el.addEventListener('mousedown', dragStart);
  },

  bindNodeTooltip(el, node) {
    const tooltip = this.container.querySelector('#designer-tooltip');
    if (!tooltip) return;

    el.addEventListener('mouseenter', (e) => {
      if (this.isDragging) return;
      tooltip.style.display = 'block';
      tooltip.innerHTML = `
        <div style="font-weight: 900; color: #ffffff; font-size: 0.75rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em;">${node.name}</div>
        <div style="font-size: 0.62rem; color: #a1a1aa; text-transform: uppercase; margin-top: 3px; font-weight: 800; font-family: var(--font-mono);">TYPE: ${node.type}</div>
        <div style="font-size: 0.62rem; color: ${node.status === 'online' ? '#22c55e' : '#ef4444'}; margin-top: 3px; font-weight: 900; font-family: var(--font-mono); text-transform: uppercase;">STATUS: ${node.status.toUpperCase()}</div>
      `;
    });

    el.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        tooltip.style.display = 'none';
        return;
      }
      let left = e.clientX + 15;
      let top = e.clientY + 15;
      if (left + 160 > window.innerWidth) {
        left = e.clientX - 170;
      }
      if (top + 80 > window.innerHeight) {
        top = e.clientY - 90;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
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

    // Instantly update node selection states on canvas
    this.updateNodeSelectionStates();
  },

  updateNodeSelectionStates() {
    if (!this.container) return;
    this.container.querySelectorAll('.designer-node').forEach(el => {
      const nodeId = el.getAttribute('data-id');
      const isSelected = nodeId === this.selectedNodeId;
      const titleEl = el.querySelector('.node-title');
      const typeEl = el.querySelector('.node-type-label');

      if (isSelected) {
        el.classList.add('selected');
        el.style.background = '#ffffff';
        el.style.color = '#000000';
        el.style.boxShadow = '5px 5px 0 #ffffff';
        if (titleEl) titleEl.style.color = '#000000';
        if (typeEl) typeEl.style.color = '#33333e';
      } else {
        el.classList.remove('selected');
        el.style.background = '#0e0e11';
        el.style.color = '#ffffff';
        el.style.boxShadow = '3px 3px 0 #ffffff';
        if (titleEl) titleEl.style.color = '#ffffff';
        if (typeEl) typeEl.style.color = '#a1a1aa';
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

    // Zoom canvas via wheel scroll (centered on cursor)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = 1.1;
      const oldScale = this.scale;
      let newScale = oldScale;

      if (e.deltaY < 0) {
        newScale = Math.min(2.0, oldScale * zoomFactor);
      } else {
        newScale = Math.max(0.5, oldScale / zoomFactor);
      }

      if (oldScale > 0) {
        const ratio = newScale / oldScale;
        this.panX = mouseX - (mouseX - this.panX) * ratio;
        this.panY = mouseY - (mouseY - this.panY) * ratio;
      }
      
      this.scale = newScale;
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
      fitBtn.addEventListener('click', () => this.fitView());
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
