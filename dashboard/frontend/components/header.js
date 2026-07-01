// Header component - real-time status bar & clocks
import { store } from '../core/state.js';

export const Header = {
  init(headerEl) {
    // Listen to metrics and service registry updates to patch elements
    store.on('metrics', () => this.updateUI());
    store.on('services', () => this.updateUI());
    
    // Start live clock intervals
    this.startClock();
  },

  updateUI() {
    const stats = store.get('metrics');
    const services = store.get('services') || [];
    if (!stats) return;

    // 1. Update text metadata
    const hostNameEl = document.getElementById("host-name");
    const hostOsEl = document.getElementById("host-os");
    const hostIpEl = document.getElementById("host-ip");
    const hostKernelEl = document.getElementById("host-kernel");
    const liveUptimeEl = document.getElementById("live-uptime");

    if (hostNameEl) hostNameEl.textContent = stats.hostname.toUpperCase();
    if (hostOsEl) hostOsEl.textContent = stats.osName;
    if (hostIpEl) hostIpEl.textContent = stats.ipAddress;
    if (hostKernelEl) hostKernelEl.textContent = `Kernel: ${stats.kernel}`;
    if (liveUptimeEl) liveUptimeEl.innerHTML = `<span class="white-text">${stats.uptime}</span>`;

    // 2. Render dynamic status pills
    const statusPills = document.getElementById("header-status-pills");
    if (!statusPills) return;
    statusPills.innerHTML = "";

    // 2.1 Docker Pill
    const dockerOnline = stats.dockerStatus === "Online";
    const dockerPill = document.createElement("span");
    dockerPill.className = "status-pill";
    dockerPill.innerHTML = `
      <span class="led ${dockerOnline ? 'green' : 'red'}"></span>
      Docker: ${dockerOnline ? `${stats.runningContainers}/${stats.containerCount} Active` : 'Offline'}
    `;
    statusPills.appendChild(dockerPill);

    // 2.2 Cloudflare Tunnel Pill
    const tunnelService = services.find(s => s.id === 'cloudflared');
    const tunnelOnline = tunnelService && tunnelService.status === 'Active';
    const tunnelPill = document.createElement("span");
    tunnelPill.className = "status-pill";
    tunnelPill.innerHTML = `
      <span class="led ${tunnelOnline ? 'green' : 'red'}"></span>
      Tunnel: ${tunnelOnline ? 'Exposed' : 'Offline'}
    `;
    statusPills.appendChild(tunnelPill);

    // 2.3 Prometheus Scraper Pill
    const promService = services.find(s => s.id === 'prometheus');
    const promOnline = promService && promService.status === 'Active';
    const promPill = document.createElement("span");
    promPill.className = "status-pill";
    promPill.innerHTML = `
      <span class="led ${promOnline ? 'green' : 'red'}"></span>
      Scraper: ${promOnline ? 'Active' : 'Offline'}
    `;
    statusPills.appendChild(promPill);

    // 2.4 Grafana Dashboard Pill
    const grafanaService = services.find(s => s.id === 'grafana');
    const grafanaOnline = grafanaService && grafanaService.status === 'Active';
    const grafanaPill = document.createElement("span");
    grafanaPill.className = "status-pill";
    grafanaPill.innerHTML = `
      <span class="led ${grafanaOnline ? 'green' : 'red'}"></span>
      Grafana: ${grafanaOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(grafanaPill);
  },

  startClock() {
    const clockTime = document.getElementById("clock-time");
    const clockDate = document.getElementById("clock-date");
    if (!clockTime || !clockDate) return;

    const updateTime = () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = now.toLocaleString('en-US', { month: 'short' });
      const year = now.getFullYear();
      clockDate.textContent = `${day} ${month} ${year}`;
      
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockTime.textContent = `${h}:${m}:${s}`;
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  }
};

export default Header;
