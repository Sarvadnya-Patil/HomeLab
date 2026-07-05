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
      <div class="panel-section-header" style="border-bottom: 1px solid var(--border-slate); padding-bottom: 0.5rem;">
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

    let ascii = `Internet (Cloudflare Ingress Tunnel)\n`;
    ascii += `  │\n`;

    // Filter active services exposed via public domain tunnel
    const routingServices = data.filter(s => s.domain && s.domain.public && s.status === 'Active');
    
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
    data.forEach((s, idx) => {
      const isLast = idx === data.length - 1;
      const branch = isLast ? `  └── ` : `  ├── `;
      const statusMark = s.status === 'Active' ? '▲' : '▼';
      ascii += `${branch}${s.name.padEnd(16)} [Port: ${(s.ports.http || 'N/A').toString().padEnd(5)}] [Status: ${statusMark} ${s.status}]\n`;
    });

    asciiEl.textContent = ascii;

    // Dynamically align the terminal body height to match the Ingress Routing Tree
    setTimeout(() => {
      const ingressBody = container.querySelector('.network-map-body');
      const terminalBody = document.querySelector('.grid-terminal .terminal-body');
      if (ingressBody && terminalBody) {
        terminalBody.style.height = `${ingressBody.clientHeight}px`;
      }
    }, 50);
  },

  resize(container, size) { },
  destroy(container) { }
};
