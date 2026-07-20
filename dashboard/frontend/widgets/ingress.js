// Ingress Routing Tree widget module

export default {
  id: 'ingress',
  title: 'Ingress Map',
  icon: 'globe',
  supportedSizes: ['2x1'],
  wsEvents: ['services'],

  render(container) {
    container.className = 'grid-network-map widget-item';
    container.innerHTML = `
      <div class="panel-section-header" style="border-bottom: none !important; padding-bottom: 0.5rem; display: flex; align-items: center; min-height: 28px; box-sizing: border-box;">
        <span class="panel-title">Ingress Routing Tree</span>
      </div>
      <div class="network-map-body" style="background-color: var(--bg-shell); border: 1px solid var(--border-slate); border-radius: 4px; padding: 0.5rem; height: auto; overflow: hidden;">
        <pre class="network-tree-ascii" id="w-ingress-ascii" style="font-family: var(--font-mono); font-size: 0.7rem; line-height: 1.4; color: var(--text-secondary);">
Detecting networks...
        </pre>
      </div>
    `;
  },

  update(container, data) {
    const asciiEl = container.querySelector('#w-ingress-ascii');
    if (!asciiEl || !Array.isArray(data)) return;

    const filterQuery = (document.getElementById("cmd-palette")?.value || '').toLowerCase();

    let ascii = `Internet (Cloudflare Ingress Tunnel)\n`;
    ascii += `  │\n`;

    // Filter active services exposed via public domain tunnel
    const routingServices = data.filter(s => s.domain && s.domain.public && s.status === 'Active' && 
      (!filterQuery || s.name.toLowerCase().includes(filterQuery) || s.domain.public.toLowerCase().includes(filterQuery)));
    
    if (routingServices.length === 0) {
      ascii += `  └── [No active public routing tunnels detected]\n`;
    } else {
      routingServices.forEach((s, idx) => {
        const isLast = idx === routingServices.length - 1;
        const branch = isLast ? `  └── ` : `  ├── `;
        ascii += `${branch}[CNAME] ${s.domain.public.padEnd(28)} ──► ${s.name} (Port ${s.ports.http || 'N/A'})\n`;
      });
    }

    ascii += `\nLocal Bridge Interface [homelab-network]\n`;
    const localServices = data.filter(s => !filterQuery || s.name.toLowerCase().includes(filterQuery));
    if (localServices.length === 0) {
      ascii += `  └── [No matching bridge services found]\n`;
    } else {
      localServices.forEach((s, idx) => {
        const isLast = idx === localServices.length - 1;
        const branch = isLast ? `  └── ` : `  ├── `;
        const statusMark = s.status === 'Active' ? '▲' : '▼';
        ascii += `${branch}${s.name.padEnd(16)} [Port: ${(s.ports.http || 'N/A').toString().padEnd(5)}] [Status: ${statusMark} ${s.status}]\n`;
      });
    }

    asciiEl.textContent = ascii;

    // Mutually assured height sync: Align terminal panel to match routing tree
    const termContainer = document.querySelector('.grid-terminal');
    if (termContainer) {
      // Temporarily collapse the terminal container to measure ingress naturally
      termContainer.style.height = '0px';
      termContainer.style.overflow = 'hidden';

      const naturalHeight = container.offsetHeight;

      // Lock both containers to this natural height
      termContainer.style.height = `${naturalHeight}px`;
      termContainer.style.overflow = '';
      container.style.height = `${naturalHeight}px`;
    }
  },

  resize(container, size) { },
  destroy(container) { }
};
