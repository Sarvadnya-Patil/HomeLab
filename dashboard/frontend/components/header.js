// Header component - real-time status bar & clocks
import { store } from '../core/state.js';

export const Header = {
  init(headerEl) {
    // Listen to metrics updates for host info
    store.on('metrics', () => this.updateUI());
    // Listen to unified health status updates for status pills
    store.on('healthStatus', ({ value }) => this.updateHealthUI(value));
    
    // Trigger initial render if healthStatus is already loaded
    const currentHealth = store.get('healthStatus');
    if (currentHealth) {
      this.updateHealthUI(currentHealth);
    }

    // Start live clock intervals
    this.startClock();
  },

  updateUI() {
    const stats = store.get('metrics');
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
  },

  updateHealthUI(healthData) {
    const statusPills = document.getElementById("header-status-pills");
    if (!statusPills || !healthData || !healthData.subsystems) return;
    statusPills.innerHTML = "";

    const subs = healthData.subsystems;

    // 1. Docker Pill
    const dockerOnline = subs.docker && subs.docker.status === "online";
    const dockerPill = document.createElement("span");
    dockerPill.className = "status-pill";
    dockerPill.innerHTML = `
      <span class="led ${dockerOnline ? 'green' : 'red'}"></span>
      Docker: ${dockerOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(dockerPill);

    // 2. Cloudflare Tunnel Pill
    const tunnelOnline = subs.tunnel && subs.tunnel.status === "online";
    const tunnelPill = document.createElement("span");
    tunnelPill.className = "status-pill";
    tunnelPill.innerHTML = `
      <span class="led ${tunnelOnline ? 'green' : 'red'}"></span>
      Tunnel: ${tunnelOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(tunnelPill);

    // 3. Prometheus Scraper Pill
    const scraperOnline = subs.scraper && subs.scraper.status === "online";
    const scraperPill = document.createElement("span");
    scraperPill.className = "status-pill";
    scraperPill.innerHTML = `
      <span class="led ${scraperOnline ? 'green' : 'red'}"></span>
      Scraper: ${scraperOnline ? 'Online' : 'Offline'}
    `;
    statusPills.appendChild(scraperPill);

    // 4. Scheduler Pill
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
