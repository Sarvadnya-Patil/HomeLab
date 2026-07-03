// Metrics Aggregation Subsystem (100% Real Node + Exporter Telemetry)
import fs from 'fs';
import os from 'os';
import { Logger } from '../utils/logger';
import { SystemStats } from '../types';

async function fetchWithTimeout(url: string, options: any = {}, timeout = 2000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export class MetricsCollector {
  private nodeExporterUrl: string;
  private lastCpuTicks: { idle: number; total: number } | null = null;
  private cachedStats: SystemStats;

  constructor(nodeExporterUrl: string = 'http://node-exporter:9100') {
    this.nodeExporterUrl = nodeExporterUrl;

    // Set initial real host specs using Node's built-in OS library
    this.cachedStats = {
      hostname: this._resolveHostname(),
      kernel: `${os.type()} ${os.release()}`,
      osName: this._getOSName(),
      ipAddress: this._getIpAddress(),
      cpuModel: os.cpus() && os.cpus().length > 0 ? os.cpus()[0].model : 'Unknown CPU',
      cpuCores: os.cpus() ? os.cpus().length : 1,
      cpu: null,
      cpuTemp: null,
      cpuFreq: null,
      ram: null,
      ramGbUsed: null,
      ramGbTotal: null,
      gpu: null,
      gpuTemp: null,
      disk: null,
      diskGbUsed: null,
      diskGbTotal: null,
      uptime: '0s',
      loadAvg: [0, 0, 0],
      dockerVersion: null,
      dockerStatus: 'Offline',
      containerCount: 0,
      runningContainers: 0,
      stoppedContainers: 0
    };

    Logger.info(
      'MetricsSubsystem',
      `Collector initialized. Node Host OS: ${this.cachedStats.osName}`
    );
  }

  getMetrics(): SystemStats {
    return this.cachedStats;
  }

  // Scrape host stats reactively
  async collect(dockerClient?: any): Promise<SystemStats> {
    // 1. Calculate REAL CPU load percentage from OS cpus ticks
    this._calculateRealCpuLoad();

    // 2. Fetch REAL RAM stats from OS
    this._calculateRealRam();

    // 3. Convert Host Uptime
    this._calculateRealUptime();

    // Update real load average array
    this.cachedStats.loadAvg = os.loadavg();

    // 4. Try parsing Prometheus Node Exporter metrics for extra data (disk space / temperature)
    try {
      const res = await fetchWithTimeout(`${this.nodeExporterUrl}/metrics`, {}, 1500);
      if (res.ok) {
        const text = await res.text();
        const parsed = this._parsePrometheusText(text);

        // Update disk metrics from exporter if available
        if (parsed.diskTotal && parsed.diskFree) {
          this.cachedStats.diskGbTotal = Math.round(parsed.diskTotal / 1024 ** 3);
          const used = parsed.diskTotal - parsed.diskFree;
          this.cachedStats.diskGbUsed = Math.round(used / 1024 ** 3);
          this.cachedStats.disk = Math.round((used / parsed.diskTotal) * 100);
        }

        // CPU temperature parsing from Node Exporter hwmon sensor metrics if they exist
        if (parsed.cpuTemp !== undefined) {
          this.cachedStats.cpuTemp = parsed.cpuTemp;
        } else {
          this.cachedStats.cpuTemp = null; // No fakes
        }
      } else {
        this._clearExporterMetrics();
      }
    } catch {
      // Gracefully clear disk and temp if exporter is offline
      this._clearExporterMetrics();
    }

    // 5. Query active Docker Stats via Docker Client
    if (dockerClient) {
      try {
        const version = await dockerClient.getVersion();
        const containers = await dockerClient.getContainers();

        this.cachedStats.dockerStatus = 'Online';
        this.cachedStats.dockerVersion = version;
        this.cachedStats.containerCount = containers.length;
        this.cachedStats.runningContainers = containers.filter(
          (c: any) => c.State === 'running'
        ).length;
        this.cachedStats.stoppedContainers = containers.filter(
          (c: any) => c.State !== 'running'
        ).length;
      } catch (err: any) {
        this.cachedStats.dockerStatus = 'Offline';
        this.cachedStats.dockerVersion = null;
        this.cachedStats.containerCount = 0;
        this.cachedStats.runningContainers = 0;
        this.cachedStats.stoppedContainers = 0;
      }
    }

    return this.cachedStats;
  }

  // Parses OS Pretty Name
  private _getOSName(): string {
    try {
      if (os.platform() === 'win32') return 'Windows Host';
      if (os.platform() === 'darwin') return 'macOS Host';
      if (fs.existsSync('/etc/os-release')) {
        const content = fs.readFileSync('/etc/os-release', 'utf8');
        const match = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
        if (match) return match[1];
      }
      return 'Linux Server';
    } catch {
      return 'Linux Host';
    }
  }

  // Parses Host Network IP Address
  private _getIpAddress(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const netList = nets[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private _calculateRealCpuLoad(): void {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) return;

    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }

    if (this.lastCpuTicks !== null) {
      const deltaTotal = total - this.lastCpuTicks.total;
      const deltaIdle = idle - this.lastCpuTicks.idle;
      if (deltaTotal > 0) {
        this.cachedStats.cpu = Math.round((1 - deltaIdle / deltaTotal) * 100);
      }
    }
    this.lastCpuTicks = { idle, total };
  }

  private _calculateRealRam(): void {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    this.cachedStats.ramGbTotal = (total / 1024 ** 3).toFixed(1);
    this.cachedStats.ramGbUsed = (used / 1024 ** 3).toFixed(1);
    this.cachedStats.ram = Math.round((used / total) * 100);
  }

  private _calculateRealUptime(): void {
    const seconds = os.uptime();
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      this.cachedStats.uptime = `${days}d ${hours}h ${mins}m`;
    } else if (hours > 0) {
      this.cachedStats.uptime = `${hours}h ${mins}m`;
    } else {
      this.cachedStats.uptime = `${mins}m`;
    }
  }

  private _clearExporterMetrics(): void {
    this.cachedStats.disk = null;
    this.cachedStats.diskGbUsed = null;
    this.cachedStats.diskGbTotal = null;
    this.cachedStats.cpuTemp = null;
  }

  private _parsePrometheusText(text: string): Record<string, number> {
    const metrics: Record<string, number> = {};
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split(' ');
      if (parts.length < 2) continue;
      const key = parts[0];
      const val = parseFloat(parts[1]);

      if (key.startsWith('node_filesystem_size_bytes') && key.includes('mountpoint="/"')) {
        metrics.diskTotal = val;
      } else if (key.startsWith('node_filesystem_free_bytes') && key.includes('mountpoint="/"')) {
        metrics.diskFree = val;
      } else if (
        key.startsWith('node_hwmon_temp_celsius') ||
        key.startsWith('node_hwmon_temp1_input')
      ) {
        metrics.cpuTemp = val;
      }
    }
    return metrics;
  }

  private _resolveHostname(): string {
    const envHost = process.env.SERVER_HOSTNAME || process.env.HOST_HOSTNAME;
    if (envHost) return envHost;

    const sysHost = os.hostname();
    if (/^[0-9a-fA-F]{12}$/.test(sysHost)) {
      return 'homelab-host';
    }
    return sysHost;
  }

  setHostname(name: string): void {
    this.cachedStats.hostname = name;
  }
}
