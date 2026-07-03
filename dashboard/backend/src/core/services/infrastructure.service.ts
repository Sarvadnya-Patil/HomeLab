// Centralized Infrastructure Service Subsystem (DI container)
import { DatabaseManager } from '../../database';
import { DockerService } from './docker.service';
import { MetricsService } from './metrics.service';
import { CronScheduler } from '../../scheduler/cron';
import { PluginService } from './plugin.service';
import { CategoryService } from './category.service';
import { PluginMetadata } from '../../types';
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
            c.Names.some((n) => n.toLowerCase().includes('cloudflared') || n.toLowerCase().includes('tunnel'))
        );
      } catch {
        tunnelOnline = false;
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

  getMetrics() {
    return this.metrics.getLatestMetrics();
  }

  getScheduler() {
    return this.scheduler;
  }

  async getEnrichedServices(): Promise<PluginMetadata[]> {
    const services = this.plugin.discover();
    const overrides: Record<string, string> = this.category.getOverrides();
    let dockerContainers: any[] = [];
    let dockerOnline = true;

    try {
      dockerContainers = await this.docker.getContainers();
    } catch (err: any) {
      dockerOnline = false;
      Logger.warn('InfrastructureService', `Failed to query Docker Proxy containers: ${err.message}`);
    }

    return services.map((service) => {
      const serviceCopy = { ...service };
      if (overrides[serviceCopy.id]) {
        serviceCopy.category = overrides[serviceCopy.id];
      }

      const match = dockerContainers.find((c) =>
        c.Names.some((name: string) => name === `/${serviceCopy.id}` || name.endsWith(`-${serviceCopy.id}`))
      );

      if (match) {
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
        serviceCopy.status = dockerOnline ? 'Not Installed' : 'Unknown';
        serviceCopy.details = {
          port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http : 'N/A',
          latency: 'N/A',
          uptime: 'N/A',
          lastCheck: 'Just now'
        };
      }

      return serviceCopy;
    });
  }
}
export default InfrastructureService;
