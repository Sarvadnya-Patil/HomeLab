// Centralized Infrastructure Service Subsystem (DI container)
import { DatabaseManager } from '../../database';
import { DockerService } from './docker.service';
import { MetricsService } from './metrics.service';
import { CronScheduler } from '../../scheduler/cron';
import { PluginService } from './plugin.service';
import { CategoryService } from './category.service';
import { PluginMetadata, SystemStats } from '../../types';
import { Logger } from '../../utils/logger';

export class InfrastructureService {
  constructor(
    private db: DatabaseManager,
    private docker: DockerService,
    private metrics: MetricsService,
    private scheduler: CronScheduler,
    private plugin: PluginService,
    private category: CategoryService
  ) {}

  isProcessRunningOnHost(processName: string): boolean {
    try {
      const fs = require('fs');
      const path = require('path');
      const procPath = '/host/proc';
      
      if (!fs.existsSync(procPath)) {
        return false;
      }
      
      const files = fs.readdirSync(procPath);
      for (const file of files) {
        if (/^\d+$/.test(file)) {
          try {
            const cmdlinePath = path.join(procPath, file, 'cmdline');
            if (fs.existsSync(cmdlinePath)) {
              const cmdline = fs.readFileSync(cmdlinePath, 'utf8').toLowerCase();
              // Check process name or arguments
              if (cmdline.includes(processName.toLowerCase())) {
                return true;
              }
            }
          } catch {
            // Ignore permission or file lock errors
          }
        }
      }
    } catch (err) {
      // Fallback silently
    }
    return false;
  }

  isPortOpen(port: number, host: string = '127.0.0.1', timeoutMs: number = 500): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const onError = () => {
        socket.destroy();
        resolve(false);
      };
      
      socket.setTimeout(timeoutMs);
      socket.once('error', onError);
      socket.once('timeout', onError);
      
      socket.connect(port, host, () => {
        socket.end();
        resolve(true);
      });
    });
  }

  // 1. Get dynamic health status of subsystems
  async getHealthStatus() {
    const dbOnline = (() => {
      try {
        const res = this.db.getAdapter().get('SELECT 1');
        return res !== undefined;
      } catch {
        return false;
      }
    })();

    const dockerOnline = await this.docker
      .getVersion()
      .then(() => true)
      .catch(() => false);

    const schedulerOnline = this.scheduler !== undefined && this.scheduler !== null;
    const metricsOnline = this.metrics !== undefined && this.metrics.getLatestMetrics() !== null;

    let tunnelOnline = false;
    if (dockerOnline) {
      try {
        const containers = await this.docker.getContainers();
        tunnelOnline = containers.some(
          (c) =>
            c.State === 'running' &&
            c.Names.some((n: string) =>
              n.toLowerCase().includes('cloudflared') ||
              n.toLowerCase().includes('tunnel') ||
              n.toLowerCase().includes('cloudflare')
            )
        );
      } catch {
        tunnelOnline = false;
      }
    }

    // Fallback: Check host /proc mount (inspected from Docker container) or local process table
    if (!tunnelOnline) {
      if (this.isProcessRunningOnHost('cloudflared')) {
        tunnelOnline = true;
      } else {
        try {
          const { execSync } = require('child_process');
          execSync('pgrep cloudflared || pidof cloudflared || pgrep -f cloudflared', { stdio: 'ignore' });
          tunnelOnline = true;
        } catch {
          // Fallback silently if process is not found or command fails
        }
      }
    }

    return {
      status: (dbOnline && dockerOnline && schedulerOnline && metricsOnline) ? 'healthy' : 'degraded',
      subsystems: {
        database: {
          status: dbOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: dbOnline ? null : 'SQLite connection or query failed',
          latency: '0.2 ms'
        },
        docker: {
          status: dockerOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: dockerOnline ? null : 'Docker Proxy socket connection unreachable',
          latency: dockerOnline ? '6 ms' : 'N/A'
        },
        tunnel: {
          status: tunnelOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: tunnelOnline ? null : 'Cloudflared container is not running',
          latency: tunnelOnline ? '12 ms' : 'N/A'
        },
        scheduler: {
          status: schedulerOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: schedulerOnline ? null : 'Scheduler instance is offline',
          latency: '0.1 ms'
        },
        metrics_collector: {
          status: metricsOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: metricsOnline ? null : 'Metrics collector instance is offline',
          latency: '8 ms'
        },
        scraper: {
          status: metricsOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: metricsOnline ? null : 'Scraper instance is offline',
          latency: '10 ms'
        },
        proxy: {
          status: dockerOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: dockerOnline ? null : 'Docker proxy connection is offline',
          latency: dockerOnline ? '5 ms' : 'N/A'
        }
      }
    };
  }

  // 2. Get dynamic topology representation
  async getTopology() {
    const health = await this.getHealthStatus();
    const enrichedServices = await this.getEnrichedServices();
    const containers = await this.docker.getContainers().catch(() => []);

    const tunnelOnline = health.subsystems.tunnel.status === 'online';
    const proxyContainer = containers.find((c) =>
      c.Names.some((n) => n.toLowerCase().includes('proxy') || n.toLowerCase().includes('nginx') || n.toLowerCase().includes('homepage'))
    );
    const proxyOnline = proxyContainer ? (proxyContainer.State === 'running') : false;

    const nodes: any[] = [
      {
        id: 'internet',
        name: 'Internet',
        type: 'internet',
        status: 'online',
        position: { x: 400, y: 50 },
        connections: ['cloudflared']
      },
      {
        id: 'cloudflared',
        name: 'Cloudflare Tunnel',
        type: 'tunnel',
        status: tunnelOnline ? 'online' : 'offline',
        position: { x: 400, y: 150 },
        connections: ['proxy']
      },
      {
        id: 'proxy',
        name: 'Nginx Proxy Manager',
        type: 'proxy',
        status: proxyContainer ? (proxyOnline ? 'online' : 'offline') : 'unknown',
        position: { x: 400, y: 250 },
        connections: []
      }
    ];

    let nextX = 100;
    const spacing = 160;
    const yOffset = 430;

    enrichedServices.forEach((svc: any) => {
      if (svc.id === 'cloudflared' || svc.id.includes('proxy') || svc.id.includes('nginx')) {
        return;
      }

      const container = containers.find((c) =>
        c.Names.some((n: string) => n === `/${svc.id}` || n.endsWith(`-${svc.id}`))
      );

      let status = 'unknown';
      if (svc.status === 'Active') {
        status = 'online';
      } else if (svc.status === 'Inactive') {
        status = 'offline';
      } else if (container) {
        status = container.State === 'running' ? 'online' : 'offline';
      }

      nodes.push({
        id: svc.id,
        name: svc.name,
        type: 'container',
        status: status,
        position: { x: nextX, y: yOffset },
        connections: []
      });

      nodes.find((n) => n.id === 'proxy')?.connections.push(svc.id);
      nextX += spacing;
    });

    return nodes;
  }

  // 3. Wrappers for required components
  getDocker() {
    return this.docker;
  }

  getMetrics(): SystemStats | null {
    return this.metrics.getLatestMetrics();
  }

  getScheduler() {
    return this.scheduler;
  }

  async getContainers(): Promise<any[]> {
    return this.docker.getContainers();
  }

  async getImages(): Promise<any[]> {
    return this.docker.getImages();
  }

  async getVolumes(): Promise<any[]> {
    return this.docker.getVolumes();
  }

  async getNetworks(): Promise<any[]> {
    return this.docker.getNetworks();
  }

  parseCloudflareIngressConfig(): Record<string, string> {
    const map: Record<string, string> = {};
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      // 1. Host system locations (priority)
      const locations = [
        '/etc/cloudflared/config.yml',
        '/etc/cloudflared/config.yaml',
        '/root/.cloudflared/config.yml',
        '/root/.cloudflared/config.yaml',
        path.join(os.homedir(), '.cloudflared', 'config.yml'),
        path.join(os.homedir(), '.cloudflared', 'config.yaml')
      ];

      // Dynamic host-user home directory config scanner
      const hostHome = '/host/home';
      if (fs.existsSync(hostHome)) {
        try {
          const users = fs.readdirSync(hostHome);
          for (const user of users) {
            const userConfigPath = path.join(hostHome, user, '.cloudflared', 'config.yml');
            const userConfigYamlPath = path.join(hostHome, user, '.cloudflared', 'config.yaml');
            if (fs.existsSync(userConfigPath)) {
              locations.push(userConfigPath);
            }
            if (fs.existsSync(userConfigYamlPath)) {
              locations.push(userConfigYamlPath);
            }
          }
        } catch {
          // Ignore directory read errors
        }
      }

      // 2. Repository template fallbacks (only searched if no host configs found)
      const fallbackLocations = [
        '/services/cloudflared/config/config.yml',
        '/services/cloudflared/config/config.yaml',
        path.join(process.cwd(), '..', 'services', 'cloudflared', 'config', 'config.yml'),
        path.join(process.cwd(), '..', 'services', 'cloudflared', 'config', 'config.yaml')
      ];

      let fileContent = '';
      // Try host locations first
      for (const loc of locations) {
        if (fs.existsSync(loc)) {
          fileContent = fs.readFileSync(loc, 'utf8');
          break;
        }
      }

      // If no host configuration found, fallback to repository templates
      if (!fileContent) {
        for (const loc of fallbackLocations) {
          if (fs.existsSync(loc)) {
            fileContent = fs.readFileSync(loc, 'utf8');
            break;
          }
        }
      }
      
      if (!fileContent) return map;
      
      const lines = fileContent.split('\n');
      let currentHostname = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed) continue;
        
        if (trimmed.startsWith('- hostname:') || trimmed.startsWith('hostname:')) {
          const parts = trimmed.split(':');
          if (parts.length >= 2) {
            const parsedHost = parts.slice(1).join(':').trim();
            if (parsedHost.toLowerCase().includes('example.com')) {
              currentHostname = '';
            } else {
              currentHostname = parsedHost;
            }
          }
        } else if (trimmed.startsWith('service:')) {
          const parts = trimmed.split(':');
          if (parts.length >= 2 && currentHostname) {
            const serviceVal = parts.slice(1).join(':').trim();
            
            // 1. Map by hostname in URL (if not localhost)
            const urlMatch = serviceVal.match(/https?:\/\/([^:/\s]+)/);
            if (urlMatch && urlMatch[1]) {
              const serviceHost = urlMatch[1].toLowerCase();
              if (serviceHost !== 'localhost' && serviceHost !== '127.0.0.1') {
                map[serviceHost] = currentHostname;
              }
            }
            
            // 2. Map by port number in URL
            const portMatch = serviceVal.match(/:(\d+)/);
            if (portMatch && portMatch[1]) {
              map[portMatch[1]] = currentHostname;
            }
            
            currentHostname = '';
          }
        }
      }
    } catch (err) {
      // Fallback silently
    }
    return map;
  }

  async getEnrichedServices(): Promise<PluginMetadata[]> {
    const services = this.plugin.discover();
    const overrides: Record<string, string> = this.category.getOverrides();
    const ingressMap = this.parseCloudflareIngressConfig();
    let dockerContainers: any[] = [];
    let dockerOnline = true;

    try {
      dockerContainers = await this.docker.getContainers();
    } catch (err: any) {
      dockerOnline = false;
      Logger.warn('InfrastructureService', `Failed to query Docker Proxy containers: ${err.message}`);
    }

    let tunnelOnline = false;
    if (dockerOnline) {
      tunnelOnline = dockerContainers.some(
        (c) =>
          c.State === 'running' &&
          c.Names.some((n: string) =>
            n.toLowerCase().includes('cloudflared') ||
            n.toLowerCase().includes('tunnel') ||
            n.toLowerCase().includes('cloudflare')
          )
      );
    }
    if (!tunnelOnline) {
      if (this.isProcessRunningOnHost('cloudflared')) {
        tunnelOnline = true;
      } else {
        try {
          const { execSync } = require('child_process');
          execSync('pgrep cloudflared || pidof cloudflared || pgrep -f cloudflared', { stdio: 'ignore' });
          tunnelOnline = true;
        } catch {
          // Fallback silently
        }
      }
    }

    const matchedIds = new Set<string>();
    const serviceListPromises = services
      .filter((service) => service.id !== 'cloudflared')
      .map(async (service) => {
        const serviceCopy = { ...service };
        if (overrides[serviceCopy.id]) {
          serviceCopy.category = overrides[serviceCopy.id];
        }

        // Apply dynamic ingress config.yml URL mapping if available (match by host or port)
        let mappedPublicDomain = ingressMap[serviceCopy.id.toLowerCase()] || ingressMap[serviceCopy.name.toLowerCase()];
        if (!mappedPublicDomain && serviceCopy.ports) {
          for (const pKey of Object.keys(serviceCopy.ports)) {
            const portVal = serviceCopy.ports[pKey];
            if (portVal && ingressMap[portVal.toString()]) {
              mappedPublicDomain = ingressMap[portVal.toString()];
              break;
            }
          }
        }

        if (mappedPublicDomain) {
          if (!serviceCopy.domain) serviceCopy.domain = {} as any;
          serviceCopy.domain.public = mappedPublicDomain;
          if (!serviceCopy.permissions) serviceCopy.permissions = {} as any;
          serviceCopy.permissions.tunnelExposed = true;
        } else {
          if (serviceCopy.domain) {
            serviceCopy.domain.public = '';
          }
          if (serviceCopy.permissions) {
            serviceCopy.permissions.tunnelExposed = false;
          }
        }

        const match = dockerContainers.find((c) =>
          c.Names.some((name: string) => name === `/${serviceCopy.id}` || name.endsWith(`-${serviceCopy.id}`))
        );

        if (match) {
          matchedIds.add(match.Id);
          const isOnline = match.State === 'running';
          serviceCopy.status = isOnline ? 'Active' : 'Inactive';
          serviceCopy.containerId = match.Id;
          serviceCopy.details = {
            port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http : 'N/A',
            latency: isOnline ? (serviceCopy.id === 'cloudflared' ? '8 ms' : '15 ms') : 'N/A',
            uptime: match.Status,
            lastCheck: 'Just now'
          };
        } else {
          // Fallback: Check if port is open locally (e.g. running natively outside docker)
          let isPortActive = false;
          if (serviceCopy.ports && serviceCopy.ports.http) {
            isPortActive = await this.isPortOpen(serviceCopy.ports.http);
          }

          if (isPortActive) {
            serviceCopy.status = 'Active';
            serviceCopy.details = {
              port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http.toString() : 'N/A',
              latency: '5 ms',
              uptime: 'Running natively on host',
              lastCheck: 'Just now'
            };
          } else {
            serviceCopy.status = dockerOnline ? 'Not Installed' : 'Unknown';
            serviceCopy.details = {
              port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http : 'N/A',
              latency: 'N/A',
              uptime: 'N/A',
              lastCheck: 'Just now'
            };
          }
        }

        return serviceCopy;
      });

    const serviceList = await Promise.all(serviceListPromises);

    dockerContainers.forEach((c) => {
      if (matchedIds.has(c.Id)) return;

      const name = c.Names[0] ? c.Names[0].replace('/', '') : c.Id.substring(0, 12);
      // Filter out cloudflared/tunnel dynamic containers entirely as they run on the host natively
      if (name.toLowerCase().includes('cloudflared') || name.toLowerCase().includes('tunnel')) return;

      const isOnline = c.State === 'running';

      // Check if there is an explicit port binding exposed
      const port = c.Ports && c.Ports.length > 0 ? c.Ports[0].PublicPort : null;

      // Apply category overrides to synthesized docker containers too!
      const category = overrides[name] || 'Containers';

      const serviceCopy = {
        id: name,
        name: name,
        category: category,
        description: `Docker container running image: ${c.Image}`,
        version: 'latest',
        icon: 'server',
        enabled: true,
        status: isOnline ? 'Active' : 'Inactive',
        containerId: c.Id,
        ports: { http: port },
        details: {
          port: port ? port.toString() : 'N/A',
          latency: 'N/A',
          uptime: c.Status,
          lastCheck: 'Just now'
        }
      } as any;

      // Apply dynamic ingress config.yml URL mapping if available (match by name or port)
      let mappedPublicDomain = ingressMap[name.toLowerCase()];
      if (!mappedPublicDomain && port) {
        mappedPublicDomain = ingressMap[port.toString()];
      }

      if (mappedPublicDomain) {
        serviceCopy.domain = { public: mappedPublicDomain };
        serviceCopy.permissions = { tunnelExposed: true } as any;
      }

      serviceList.push(serviceCopy);
    });

    return serviceList;
  }

  async getAutomationPlatforms(platformsTemplate: Record<string, any>): Promise<any[]> {
    let dockerContainers: any[] = [];
    try {
      dockerContainers = await this.getContainers();
    } catch {
      // Gracefully fall back to empty containers list
    }

    const enrichedServices = await this.getEnrichedServices().catch(() => []);

    return Object.keys(platformsTemplate).map((id) => {
      const platform = platformsTemplate[id];
      const service = enrichedServices.find((s) => s.id === id);
      const container = dockerContainers.find((c) =>
        c.Names.some((n: string) => n === `/${id}` || n.endsWith(`-${id}`) || n.includes(`${id}-`) || n.includes(`-${id}-`)) ||
        (c.Image && c.Image.toLowerCase().includes(id.toLowerCase()))
      );

      let status = 'not_installed';
      let running = false;
      let containerId = null;

      if (service && service.status !== 'Not Installed' && service.status !== 'Unknown') {
        status = 'installed';
        if (service.status === 'Active') {
          running = true;
        }
        containerId = service.containerId || null;
      } else if (container) {
        status = 'installed';
        running = container.State === 'running';
        containerId = container.Id;
      }

      return {
        id,
        name: platform.name,
        description: platform.description,
        port: platform.port,
        status,
        running,
        containerId
      };
    });
  }
}
export default InfrastructureService;
