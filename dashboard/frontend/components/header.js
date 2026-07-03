// Header component - real-time status bar & clocks
import { store } from '../core/state.js';
import { api } from '../core/api.js';

export const Header = {
  init(headerEl) {
    this.startHeaderPolling();
    this.startClock();
  },

  startHeaderPolling() {
    const fetchHeader = async () => {
      try {
        const data = await api.get('/api/v1/system/header');
        this.updateHeaderUI(data);
      } catch (err) {
        console.error('Failed to fetch unified header info:', err);
      }
    };

    fetchHeader();
    setInterval(fetchHeader, 5000);
  },

  updateHeaderUI(data) {
    if (!data) return;

    // 1. Update text metadata
    const hostNameEl = document.getElementById("host-name");
    const hostOsEl = document.getElementById("host-os");
    const hostKernelEl = document.getElementById("host-kernel");
    const liveUptimeEl = document.getElementById("live-uptime");

    if (hostNameEl) hostNameEl.textContent = data.hostname.toUpperCase();
    if (hostOsEl) hostOsEl.textContent = data.osName;
    if (hostKernelEl) hostKernelEl.textContent = `Kernel: ${data.kernel}`;
    if (liveUptimeEl) liveUptimeEl.innerHTML = `<span class="white-text">${data.uptime}</span>`;

    // 2. Update health status pills
    const statusPills = document.getElementById("header-status-pills");
    if (!statusPills || !data.subsystems) return;
    statusPills.innerHTML = "";

    const subs = data.subsystems;

    // 1. Docker Pill
    const dockerOnline = subs.docker && subs.docker.status === "online";
    const dockerPill = document.createElement("span");
    dockerPill.className = "status-pill";
    dockerPill.innerHTML = `
      <span class="led ${dockerOnline ? 'green' : 'red'}"></span>
      Docker: ${dockerOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(dockerPill);

    // 2. Proxy Pill
    const proxyOnline = subs.proxy && subs.proxy.status === "online";
    const proxyPill = document.createElement("span");
    proxyPill.className = "status-pill";
    proxyPill.innerHTML = `
      <span class="led ${proxyOnline ? 'green' : 'red'}"></span>
      Proxy: ${proxyOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(proxyPill);

    // 3. Tunnel Pill
    const tunnelOnline = subs.tunnel && subs.tunnel.status === "online";
    const tunnelPill = document.createElement("span");
    tunnelPill.className = "status-pill";
    tunnelPill.innerHTML = `
      <span class="led ${tunnelOnline ? 'green' : 'red'}"></span>
      Tunnel: ${tunnelOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(tunnelPill);

    // 4. Scraper Pill
    const scraperOnline = subs.scraper && subs.scraper.status === "online";
    const scraperPill = document.createElement("span");
    scraperPill.className = "status-pill";
    scraperPill.innerHTML = `
      <span class="led ${scraperOnline ? 'green' : 'red'}"></span>
      Scraper: ${scraperOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(scraperPill);

    // 5. Scheduler Pill
    const schedulerOnline = subs.scheduler && subs.scheduler.status === "online";
    const schedulerPill = document.createElement("span");
    schedulerPill.className = "status-pill";
    schedulerPill.innerHTML = `
      <span class="led ${schedulerOnline ? 'green' : 'red'}"></span>
      Scheduler: ${schedulerOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(schedulerPill);
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
