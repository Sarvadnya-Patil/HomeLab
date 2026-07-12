// Centralized Infrastructure Service Subsystem (DI container)
import fs from 'fs';
import path from 'path';
import net from 'net';
import dns from 'dns';
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import os from 'os';

import yaml from 'yaml';
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

  measurePortLatency(port: number, host: string = '127.0.0.1', timeoutMs: number = 1000): Promise<string> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const onError = () => {
        socket.destroy();
        resolve('N/A');
      };
      
      socket.setTimeout(timeoutMs);
      socket.once('error', onError);
      socket.once('timeout', onError);
      
      // Perform DNS resolution first to isolate lookup delay from connection latency
      dns.lookup(host, (err: any, ip: string) => {
        if (err || !ip) {
          socket.destroy();
          resolve('N/A');
          return;
        }

        const startTime = performance.now();
        socket.connect(port, ip, () => {
          const elapsed = performance.now() - startTime;
          socket.end();
          resolve(`${elapsed.toFixed(1)} ms`);
        });
      });
    });
  }

  // 1. Get dynamic health status of subsystems with real-time measured latencies
  async getHealthStatus() {
    // 1. Measure Database Latency
    let dbOnline = false;
    let dbLatency = 'N/A';
    try {
      const startTime = performance.now();
      const res = this.db.getAdapter().get('SELECT 1');
      dbOnline = res !== undefined;
      dbLatency = dbOnline ? `${(performance.now() - startTime).toFixed(2)} ms` : 'N/A';
    } catch {
      dbOnline = false;
    }

    // 2. Measure Docker Latency
    let dockerOnline = false;
    let dockerLatency = 'N/A';
    try {
      const startTime = performance.now();
      await this.docker.getVersion();
      dockerOnline = true;
      dockerLatency = `${(performance.now() - startTime).toFixed(1)} ms`;
    } catch {
      dockerOnline = false;
    }

    // 3. Measure Tunnel Status & Latency
    let tunnelOnline = false;
    const tunnelStartTime = performance.now();
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
    if (!tunnelOnline) {
      if (this.isProcessRunningOnHost('cloudflared')) {
        tunnelOnline = true;
      } else {
        try {
          execSync('pgrep cloudflared || pidof cloudflared || pgrep -f cloudflared', { stdio: 'ignore' });
          tunnelOnline = true;
        } catch {
          // Fallback silently
        }
      }
    }
    const tunnelLatency = tunnelOnline ? `${(performance.now() - tunnelStartTime).toFixed(1)} ms` : 'N/A';

    // 4. Measure Scheduler Latency
    const schedulerOnline = this.scheduler !== undefined && this.scheduler !== null;
    const schedStartTime = performance.now();
    if (schedulerOnline) {
      try {
        const check = (this.scheduler as any).jobs;
      } catch {}
    }
    const schedulerLatency = schedulerOnline ? `${(performance.now() - schedStartTime).toFixed(2)} ms` : 'N/A';

    // 5. Measure Metrics Collector Latency
    const metricsOnline = this.metrics !== undefined && this.metrics.getLatestMetrics() !== null;
    const metricsStartTime = performance.now();
    if (metricsOnline) {
      try {
        this.metrics.getLatestMetrics();
      } catch {}
    }
    const metricsLatency = metricsOnline ? `${(performance.now() - metricsStartTime).toFixed(2)} ms` : 'N/A';

    // 6. Measure Scraper Latency
    const scraperStartTime = performance.now();
    const isDashboardActive = await this.isPortOpen(8081);
    const scraperLatency = `${(performance.now() - scraperStartTime).toFixed(1)} ms`;

    // 7. Measure Proxy Latency
    const proxyStartTime = performance.now();
    const proxyOnline = dockerOnline && await this.isPortOpen(2375, 'docker-proxy');
    const proxyLatency = proxyOnline ? `${(performance.now() - proxyStartTime).toFixed(1)} ms` : 'N/A';

    return {
      status: (dbOnline && dockerOnline && schedulerOnline && metricsOnline) ? 'healthy' : 'degraded',
      subsystems: {
        database: {
          status: dbOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: dbOnline ? null : 'SQLite connection or query failed',
          latency: dbLatency
        },
        docker: {
          status: dockerOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: dockerOnline ? null : 'Docker Proxy socket connection unreachable',
          latency: dockerLatency
        },
        tunnel: {
          status: tunnelOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: tunnelOnline ? null : 'Cloudflared container is not running',
          latency: tunnelLatency
        },
        scheduler: {
          status: schedulerOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: schedulerOnline ? null : 'Scheduler instance is offline',
          latency: schedulerLatency
        },
        metrics_collector: {
          status: metricsOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: metricsOnline ? null : 'Metrics collector instance is offline',
          latency: metricsLatency
        },
        scraper: {
          status: metricsOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: metricsOnline ? null : 'Scraper instance is offline',
          latency: scraperLatency
        },
        proxy: {
          status: proxyOnline ? 'online' : 'offline',
          lastHeartbeat: new Date().toISOString(),
          lastError: proxyOnline ? null : 'Docker proxy connection is offline',
          latency: proxyLatency
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

  private updateComposeCache(containers: any[]): void {
    const cacheFilePath = path.join(process.cwd(), 'data', 'compose_cache.json');
    
    const dataDir = path.dirname(cacheFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let cache: Record<string, any> = {};
    if (fs.existsSync(cacheFilePath)) {
      try {
        cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      } catch {
        // ignore malformed cache
      }
    }

    let modified = false;
    for (const c of containers) {
      if (c.Labels) {
        const workingDir = c.Labels['com.docker.compose.project.working_dir'];
        const configFiles = c.Labels['com.docker.compose.project.config_files'];
        const projectName = c.Labels['com.docker.compose.project'];
        const serviceName = c.Labels['com.docker.compose.service'] || (c.Names && c.Names[0] ? c.Names[0].replace('/', '') : '');

        if (workingDir && serviceName) {
          cache[serviceName] = {
            workingDir,
            configFiles: configFiles || '',
            projectName: projectName || '',
            image: c.Image || '',
            lastSeen: new Date().toISOString()
          };
          modified = true;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
    }
  }

  async getContainers(): Promise<any[]> {
    let containers: any[] = [];
    try {
      containers = await this.docker.getContainers();
      this.updateComposeCache(containers);
    } catch (err: any) {
      Logger.warn('InfrastructureService', `Failed to query Docker Proxy containers: ${err.message}`);
    }

    const matchedNames = new Set<string>();
    for (const c of containers) {
      if (c.Names) {
        for (const name of c.Names) {
          matchedNames.add(name.replace('/', ''));
        }
      }
    }

    const placeholders: any[] = [];

    // 1. Load cached offline compose containers from compose_cache.json
    try {
      const cacheFilePath = path.join(process.cwd(), 'data', 'compose_cache.json');
      if (fs.existsSync(cacheFilePath)) {
        const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        for (const serviceName of Object.keys(cache)) {
          if (!matchedNames.has(serviceName) && !placeholders.some(p => p.Names.includes(`/${serviceName}`))) {
            const entry = cache[serviceName];
            placeholders.push({
              Id: '',
              Names: [`/${serviceName}`],
              State: 'Offline',
              Status: 'Not Deployed',
              Image: entry.image || 'latest',
              IsServicePlaceholder: true,
              Labels: {
                'com.docker.compose.project.working_dir': entry.workingDir,
                'com.docker.compose.project.config_files': entry.configFiles
              }
            });
          }
        }
      }
    } catch (err: any) {
      Logger.error('InfrastructureService', `Failed to merge compose cache: ${err.message}`);
    }

    // 2. Load registered services from plugin registry
    try {
      const services = this.plugin.discover();
      for (const s of services) {
        const alreadyListed = matchedNames.has(s.id) || placeholders.some(p => p.Names.includes(`/${s.id}`) || p.Names.some((n: string) => n.endsWith(`-${s.id}`)));
        if (!alreadyListed) {
          placeholders.push({
            Id: '',
            Names: [`/${s.id}`],
            State: 'Offline',
            Status: 'Not Deployed',
            Image: s.version || 'latest',
            IsServicePlaceholder: true
          });
        }
      }
    } catch (err: any) {
      Logger.error('InfrastructureService', `Failed to merge service plugin placeholders: ${err.message}`);
    }
    // Query restart policies for active containers
    const restartPolicies: Record<string, string> = {};
    try {
      const activeIds = containers.map(c => c.Id).filter(Boolean);
      if (activeIds.length > 0) {
        const inspectOut = execSync(`docker inspect --format "{{.Id}} {{.HostConfig.RestartPolicy.Name}}" ${activeIds.join(' ')}`, {
          env: { DOCKER_HOST: 'tcp://docker-proxy:2375' },
          timeout: 10000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        for (const line of inspectOut.trim().split('\n')) {
          const parts = line.trim().split(' ');
          const id = parts[0];
          const policy = parts[1];
          if (id && policy) {
            restartPolicies[id.trim()] = policy.trim();
          }
        }
      }
    } catch (err: any) {
      Logger.warn('InfrastructureService', `Failed to query restart policies: ${err.message}`);
    }

    for (const c of containers) {
      const policy = restartPolicies[c.Id] || restartPolicies[c.Id.substring(0, 12)] || 'no';
      c.RestartPolicy = policy;
      c.Autostart = (policy === 'always' || policy === 'unless-stopped');
    }

    return [...containers, ...placeholders];
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

          let latency = 'N/A';
          if (isOnline && mappedPublicDomain) {
            latency = await this.measurePortLatency(443, mappedPublicDomain);
            if (latency === 'N/A') {
              latency = await this.measurePortLatency(80, mappedPublicDomain);
            }
          }

          serviceCopy.details = {
            port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http : 'N/A',
            latency,
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
            
            let latency = 'N/A';
            if (mappedPublicDomain) {
              latency = await this.measurePortLatency(443, mappedPublicDomain);
              if (latency === 'N/A') {
                latency = await this.measurePortLatency(80, mappedPublicDomain);
              }
            }

            serviceCopy.details = {
              port: serviceCopy.ports && serviceCopy.ports.http ? serviceCopy.ports.http.toString() : 'N/A',
              latency,
              uptime: 'Running natively on host',
              lastCheck: 'Just now'
            };
          } else {
            serviceCopy.status = dockerOnline ? 'Offline' : 'Unknown';
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

    for (const c of dockerContainers) {
      if (matchedIds.has(c.Id)) continue;

      const name = c.Names[0] ? c.Names[0].replace('/', '') : c.Id.substring(0, 12);
      // Filter out cloudflared/tunnel dynamic containers entirely as they run on the host natively
      if (name.toLowerCase().includes('cloudflared') || name.toLowerCase().includes('tunnel')) continue;

      const isOnline = c.State === 'running';

      // Check if there is an explicit port binding exposed
      // Scan all ports (PublicPort or PrivatePort) to match ingress mapping
      let port = null;
      let mappedPublicDomain = ingressMap[name.toLowerCase()];

      if (c.Ports && c.Ports.length > 0) {
        for (const p of c.Ports) {
          const pub = p.PublicPort;
          const priv = p.PrivatePort;
          if (pub && ingressMap[pub.toString()]) {
            mappedPublicDomain = ingressMap[pub.toString()];
            port = pub;
            break;
          }
          if (priv && ingressMap[priv.toString()]) {
            mappedPublicDomain = ingressMap[priv.toString()];
            port = priv;
            break;
          }
        }
        if (!port) {
          port = c.Ports[0].PublicPort || c.Ports[0].PrivatePort || null;
        }
      }

      // Apply category overrides to synthesized docker containers too!
      const category = overrides[name] || 'Containers';

      let latency = 'N/A';
      if (isOnline && mappedPublicDomain) {
        latency = await this.measurePortLatency(443, mappedPublicDomain);
        if (latency === 'N/A') {
          latency = await this.measurePortLatency(80, mappedPublicDomain);
        }
      }

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
          latency,
          uptime: c.Status,
          lastCheck: 'Just now'
        }
      } as any;

      if (mappedPublicDomain) {
        serviceCopy.domain = { public: mappedPublicDomain };
        serviceCopy.permissions = { tunnelExposed: true } as any;
      }

      serviceList.push(serviceCopy);
    }

    return serviceList.filter((s) => s.status === 'Active' || s.status === 'Inactive');
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

  async scanSystemComposeFiles(dirs: string[], maxDepth = 4): Promise<void> {
    const cacheFilePath = path.join(process.cwd(), 'data', 'compose_cache.json');
    let cache: Record<string, any> = {};
    if (fs.existsSync(cacheFilePath)) {
      try {
        cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      } catch { }
    }

    const ignoredDirs = new Set([
      'node_modules', '.git', 'AppData', 'Local Settings', 'Temp', 
      'cache', 'venv', '.venv', 'dist', 'build', '.idea', '.vscode',
      'System Volume Information', '$RECYCLE.BIN'
    ]);

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const files = fs.readdirSync(dir);
        let hasCompose = false;
        let composeFileName = 'docker-compose.yml';

        for (const file of files) {
          const filePath = path.join(dir, file);
          let stat;
          try {
            stat = fs.statSync(filePath);
          } catch {
            continue; // skip broken symlinks or locked files
          }

          if (stat.isDirectory()) {
            if (!ignoredDirs.has(file)) {
              walk(filePath, depth + 1);
            }
          } else if (file === 'docker-compose.yml' || file === 'docker-compose.yaml') {
            hasCompose = true;
            composeFileName = file;
          }
        }

        if (hasCompose) {
          const composePath = path.join(dir, composeFileName);
          try {
            const content = fs.readFileSync(composePath, 'utf8');
            const parsed = yaml.parse(content);
            if (parsed && parsed.services) {
              for (const serviceName of Object.keys(parsed.services)) {
                if (!cache[serviceName]) {
                  const serviceVal = parsed.services[serviceName];
                  cache[serviceName] = {
                    workingDir: dir,
                    configFiles: composePath,
                    projectName: parsed.name || path.basename(dir),
                    image: serviceVal.image || 'latest',
                    lastSeen: new Date().toISOString()
                  };
                  Logger.info('InfrastructureService', `Discovered offline compose service [${serviceName}] in [${dir}]`);
                }
              }
            }
          } catch (err: any) {
            Logger.warn('InfrastructureService', `Failed to parse compose file [${composePath}]: ${err.message}`);
          }
        }
      } catch {
        // ignore read permissions errors
      }
    };

    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        walk(dir, 0);
      }
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
  }
}
export default InfrastructureService;
