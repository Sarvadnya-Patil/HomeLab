// Workflow automation engine and external platforms REST Subsystem API routes
import { CoreEngine } from '../../core/engine';
import fs from 'fs';
import path from 'path';

const PLATFORMS: Record<string, { name: string; category: string; description: string; image: string; port: number; compose: string; service: string }> = {
  n8n: {
    name: 'n8n',
    category: 'Automation',
    description: 'Fair-code workflow automation platform with a node-based interface.',
    image: 'n8nio/n8n:latest',
    port: 5678,
    compose: `version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - TZ=UTC
    volumes:
      - ./data:/home/node/.n8n
    networks:
      - homelab-network
networks:
  homelab-network:
    external: true`,
    service: `id: n8n
name: n8n
category: Automation
description: Fair-code workflow automation platform with a node-based interface.
version: latest
icon: grid
enabled: true
compose: docker-compose.yml
ports:
  http: 5678
backup:
  enabled: true
  exportPath: backups/n8n.tar.gz
homepage:
  enabled: true
actions:
  start: docker compose up -d
  stop: docker compose down
  restart: docker compose restart
  update: docker compose pull && docker compose up -d`
  },
  'node-red': {
    name: 'Node-RED',
    category: 'Automation',
    description: 'Flow-based programming for event-driven applications.',
    image: 'nodered/node-red:latest',
    port: 1880,
    compose: `version: '3.8'
services:
  node-red:
    image: nodered/node-red:latest
    container_name: node-red
    restart: unless-stopped
    ports:
      - "1880:1880"
    volumes:
      - ./data:/data
    networks:
      - homelab-network
networks:
  homelab-network:
    external: true`,
    service: `id: node-red
name: Node-RED
category: Automation
description: Flow-based programming for event-driven applications.
version: latest
icon: grid
enabled: true
compose: docker-compose.yml
ports:
  http: 1880
backup:
  enabled: true
  exportPath: backups/node-red.tar.gz
homepage:
  enabled: true
actions:
  start: docker compose up -d
  stop: docker compose down
  restart: docker compose restart
  update: docker compose pull && docker compose up -d`
  },
  activepieces: {
    name: 'Activepieces',
    category: 'Automation',
    description: 'Open-source business automation and self-hosted Zapier alternative.',
    image: 'activepieces/activepieces:latest',
    port: 8082,
    compose: `version: '3.8'
services:
  activepieces:
    image: activepieces/activepieces:latest
    container_name: activepieces
    restart: unless-stopped
    ports:
      - "8082:8080"
    networks:
      - homelab-network
networks:
  homelab-network:
    external: true`,
    service: `id: activepieces
name: Activepieces
category: Automation
description: Open-source business automation and self-hosted Zapier alternative.
version: latest
icon: grid
enabled: true
compose: docker-compose.yml
ports:
  http: 8082
backup:
  enabled: true
  exportPath: backups/activepieces.tar.gz
homepage:
  enabled: true
actions:
  start: docker compose up -d
  stop: docker compose down
  restart: docker compose restart
  update: docker compose pull && docker compose up -d`
  },
  kestra: {
    name: 'Kestra',
    category: 'Automation',
    description: 'Infinitely scalable, event-driven orchestration and workflow engine.',
    image: 'kestra/kestra:latest',
    port: 8083,
    compose: `version: '3.8'
services:
  kestra:
    image: kestra/kestra:latest
    container_name: kestra
    restart: unless-stopped
    ports:
      - "8083:8080"
    command: server local
    networks:
      - homelab-network
networks:
  homelab-network:
    external: true`,
    service: `id: kestra
name: Kestra
category: Automation
description: Infinitely scalable, event-driven orchestration and workflow engine.
version: latest
icon: grid
enabled: true
compose: docker-compose.yml
ports:
  http: 8083
backup:
  enabled: true
  exportPath: backups/kestra.tar.gz
homepage:
  enabled: true
actions:
  start: docker compose up -d
  stop: docker compose down
  restart: docker compose restart
  update: docker compose pull && docker compose up -d`
  },
  windmill: {
    name: 'Windmill',
    category: 'Automation',
    description: 'Turn scripts into workflows, user interfaces and cron jobs in minutes.',
    image: 'windmill/windmill:latest',
    port: 8084,
    compose: `version: '3.8'
services:
  windmill:
    image: windmill/windmill:latest
    container_name: windmill
    restart: unless-stopped
    ports:
      - "8084:8000"
    networks:
      - homelab-network
networks:
  homelab-network:
    external: true`,
    service: `id: windmill
name: Windmill
category: Automation
description: Turn scripts into workflows, user interfaces and cron jobs in minutes.
version: latest
icon: grid
enabled: true
compose: docker-compose.yml
ports:
  http: 8084
backup:
  enabled: true
  exportPath: backups/windmill.tar.gz
homepage:
  enabled: true
actions:
  start: docker compose up -d
  stop: docker compose down
  restart: docker compose restart
  update: docker compose pull && docker compose up -d`
  }
};

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/automation/platforms (Query all supported platforms with dynamic status)
  fastify.get('/api/v1/automation/platforms', async () => {
    let dockerContainers: any[] = [];
    try {
      dockerContainers = await engine.docker.getContainers();
    } catch {}

    const enrichedServices = await engine.getEnrichedServices().catch(() => []);

    return Object.keys(PLATFORMS).map((id) => {
      const platform = PLATFORMS[id];
      const service = enrichedServices.find((s) => s.id === id);
      const container = dockerContainers.find((c) =>
        c.Names.some((n: string) => n === `/${id}` || n.endsWith(`-${id}`))
      );

      let status = 'not_installed';
      let running = false;
      let containerId = null;

      if (service && service.status !== 'Not Installed') {
        status = 'installed';
        if (container) {
          running = container.State === 'running';
          containerId = container.Id;
        }
      }

      return {
        id,
        name: platform.name,
        description: platform.description,
        image: platform.image,
        port: platform.port,
        status,
        running,
        containerId
      };
    });
  });

  // 2. POST: /api/v1/automation/platforms/:id/install (Launch background deployment job)
  fastify.post('/api/v1/automation/platforms/:id/install', async (request: any, reply: any) => {
    const { id } = request.params;
    const config = PLATFORMS[id];
    if (!config) {
      return reply.status(404).send({ error: `Platform ${id} is not supported.` });
    }

    const platformDir = path.join(process.cwd(), '../../services', id);
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }
    fs.writeFileSync(path.join(platformDir, 'service.yaml'), config.service, 'utf8');
    fs.writeFileSync(path.join(platformDir, 'docker-compose.yml'), config.compose, 'utf8');

    // Trigger dynamic discover
    engine.plugin.discover();

    const job = await engine.jobs.executeAsyncTask(
      'deploy_automation_platform',
      id,
      async (updateProgress) => {
        updateProgress(10, `Compiling ${config.name} stack files...`);
        updateProgress(30, `Pulling Docker image ${config.image}...`);
        try {
          await engine.docker.pullImage(config.image);
        } catch (err: any) {
          updateProgress(50, `Warn: pull failed or image cached: ${err.message}`);
        }
        updateProgress(70, `Deploying ${config.name} container services...`);
        
        // Execute container start lifecycle
        await engine.docker.executeAction(null, id, 'start').catch(() => {});
        
        updateProgress(100, `${config.name} deployment completed. Synchronizing plugin database.`);
        engine.plugin.discover();
      }
    );

    return { success: true, jobId: job.id };
  });

  // Keep compatibility fallback endpoints
  fastify.get('/api/v1/workflows', async () => {
    return engine.workflow.getRules();
  });

  fastify.post('/api/v1/workflows', async (request: any) => {
    return engine.workflow.createRule(request.body);
  });

  fastify.delete('/api/v1/workflows/:id', async (request: any) => {
    const { id } = request.params;
    return { success: engine.workflow.deleteRule(id) };
  });
}
