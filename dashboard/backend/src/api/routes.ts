// Versioned REST API v1 Controller - OS Subsystems Routing
import { CoreEngine } from '../core/engine';
import { Logger } from '../utils/logger';

export default function (fastify: any, engine: CoreEngine): void {
  
  // 1. GET: /api/v1/system (Hardware metrics logs snapshot)
  fastify.get('/api/v1/system', async (request: any, reply: any) => {
    return engine.metrics.getMetrics();
  });

  // GET: /api/v1/metrics/history (Retrieve historical performance stats for charts)
  fastify.get('/api/v1/metrics/history', async (request: any) => {
    const limit = Number(request.query.limit) || 60;
    return engine.metricsRepo.getHistory(limit);
  });

  // 2. GET: /api/v1/services (Discovered YAML manifests & enriched states)
  fastify.get('/api/v1/services', async (request: any, reply: any) => {
    Logger.debug('ApiController', 'GET /api/v1/services called.');
    return await engine.getEnrichedServices();
  });

  // 3. GET: /api/v1/services/:id/logs (Multiplexed logs tail)
  fastify.get('/api/v1/services/:id/logs', async (request: any, reply: any) => {
    const { id } = request.params;
    Logger.info('ApiController', `Logs query request for service [${id}]`);

    let dockerContainers = [];
    try {
      dockerContainers = await engine.docker.getContainers();
    } catch (err) {
      return { logs: `[DEV WORKSTATION FALLBACK]\n[INFO] Simulated container logs loop for ${id}\n[SUCCESS] Listening on local socket...` };
    }
    
    const match = dockerContainers.find(c => 
      c.Names.some((name: string) => name === `/${id}` || name.endsWith(`-${id}`))
    );
    
    if (!match) {
      return { logs: `Container for service ID [${id}] is not currently deployed on Docker host.` };
    }
    
    try {
      const logs = await engine.docker.getLogs(match.Id, id);
      return { logs };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to query logs: ${err.message}` });
    }
  });

  // 4. POST: /api/v1/services/:id/action (Lifecycle action triggers)
  fastify.post('/api/v1/services/:id/action', async (request: any, reply: any) => {
    const { id } = request.params;
    const { action } = request.body || {};
    
    Logger.info('ApiController', `Action [${action}] requested for container [${id}]`);

    let dockerContainers = [];
    try {
      dockerContainers = await engine.docker.getContainers();
    } catch (err) {
      const res = await engine.docker.executeAction(null, id, action);
      engine.notifier.notify(id, `Triggered sandbox action [${action.toUpperCase()}]`, 'warn');
      return { success: true, message: `Sandbox action completed` };
    }
    
    const match = dockerContainers.find(c => 
      c.Names.some((name: string) => name === `/${id}` || name.endsWith(`-${id}`))
    );
    
    if (!match && action !== 'start') {
      return reply.status(404).send({ error: `No container found matching service ID [${id}]` });
    }
    
    try {
      const containerId = match ? match.Id : null;
      const res = await engine.docker.executeAction(containerId, id, action);
      
      // Log audit transaction
      engine.auditRepo.log('admin', `container_${action}`, 'service', id, { containerId });
      engine.notifier.notify(id, `Executed action [${action.toUpperCase()}] successfully.`, 'info');
      
      // Update WebSocket clients immediately
      const updated = await engine.getEnrichedServices();
      engine.broadcast({ type: 'services', data: updated });

      return res;
    } catch (err: any) {
      engine.notifier.notify(id, `Action [${action.toUpperCase()}] failed: ${err.message}`, 'error');
      return reply.status(500).send({ error: `Action failed: ${err.message}` });
    }
  });

  // 5. PUT: /api/v1/services/:id/category (Override service category)
  fastify.put('/api/v1/services/:id/category', async (request: any, reply: any) => {
    const { id } = request.params;
    const { categoryId, serverId } = request.body || {};
    
    try {
      engine.servicesRepo.saveOverride(id, categoryId, serverId || 'local');
      engine.auditRepo.log('admin', 'reassign_category', 'service', id, { categoryId });
      
      // Broadcast update
      const updated = await engine.getEnrichedServices();
      engine.broadcast({ type: 'services', data: updated });
      return { success: true };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to override category: ${err.message}` });
    }
  });

  // 6. GET/POST/PUT/DELETE: /api/v1/workspaces (Workspaces CRUD routing)
  fastify.get('/api/v1/workspaces', async () => {
    return engine.workspacesRepo.findAll();
  });

  fastify.post('/api/v1/workspaces', async (request: any, reply: any) => {
    try {
      const created = engine.workspacesRepo.create(request.body);
      engine.auditRepo.log('admin', 'create_workspace', 'workspace', created.id, created);
      return created;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.put('/api/v1/workspaces/:id', async (request: any, reply: any) => {
    const { id } = request.params;
    try {
      const updated = engine.workspacesRepo.update(id, request.body);
      engine.auditRepo.log('admin', 'update_workspace', 'workspace', id, request.body);
      return updated;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/api/v1/workspaces/:id', async (request: any, reply: any) => {
    const { id } = request.params;
    try {
      const success = engine.workspacesRepo.delete(id);
      engine.auditRepo.log('admin', 'delete_workspace', 'workspace', id);
      return { success };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.put('/api/v1/workspaces/reorder', async (request: any) => {
    engine.workspacesRepo.reorder(request.body);
    return engine.workspacesRepo.findAll();
  });

  // 7. GET/POST/PUT/DELETE: /api/v1/categories (Categories CRUD routing)
  fastify.get('/api/v1/categories', async (request: any) => {
    const { workspaceId } = request.query;
    if (workspaceId) {
      return engine.categoriesRepo.findByWorkspace(workspaceId);
    }
    return engine.categoriesRepo.findAll();
  });

  fastify.post('/api/v1/categories', async (request: any, reply: any) => {
    try {
      const created = engine.categoriesRepo.create(request.body);
      engine.auditRepo.log('admin', 'create_category', 'category', created.id, created);
      return created;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.put('/api/v1/categories/:id', async (request: any, reply: any) => {
    const { id } = request.params;
    try {
      const updated = engine.categoriesRepo.update(id, request.body);
      engine.auditRepo.log('admin', 'update_category', 'category', id, request.body);
      return updated;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.delete('/api/v1/categories/:id', async (request: any, reply: any) => {
    const { id } = request.params;
    try {
      const success = engine.categoriesRepo.delete(id);
      engine.auditRepo.log('admin', 'delete_category', 'category', id);
      return { success };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.put('/api/v1/categories/reorder', async (request: any) => {
    engine.categoriesRepo.reorder(request.body);
    return engine.categoriesRepo.findAll();
  });

  // 8. GET/PUT: /api/v1/workspaces/:id/widgets (Widget positions & configurations layout CRUD)
  fastify.get('/api/v1/workspaces/:id/widgets', async (request: any) => {
    const { id } = request.params;
    return engine.widgetsRepo.findByWorkspace(id);
  });

  fastify.put('/api/v1/workspaces/:id/widgets', async (request: any) => {
    const { id } = request.params;
    engine.widgetsRepo.saveLayout(id, request.body);
    engine.auditRepo.log('admin', 'save_widgets_layout', 'workspace', id);
    return engine.widgetsRepo.findByWorkspace(id);
  });

  // 9. GET/PUT: /api/v1/settings (KeyValue system preferences configuration)
  fastify.get('/api/v1/settings', async (request: any) => {
    const { group } = request.query;
    if (group) {
      return engine.settingsRepo.findByGroup(group);
    }
    return engine.settingsRepo.findAll();
  });

  fastify.put('/api/v1/settings', async (request: any) => {
    const prefs = request.body || {};
    for (const key of Object.keys(prefs)) {
      engine.settingsRepo.set(key, prefs[key].value, prefs[key].groupName);
    }
    engine.auditRepo.log('admin', 'update_settings', 'system', 'preferences');
    return { success: true };
  });

  // 10. GET/PUT/DELETE: /api/v1/notifications (Notifications history logs routing)
  fastify.get('/api/v1/notifications', async (request: any) => {
    const limit = Number(request.query.limit) || 50;
    const unreadOnly = request.query.unread === 'true';
    return engine.notificationsRepo.findLimit(limit, unreadOnly);
  });

  fastify.put('/api/v1/notifications/:id/read', async (request: any) => {
    const { id } = request.params;
    return engine.notificationsRepo.update(id, { read: true });
  });

  fastify.delete('/api/v1/notifications/read', async () => {
    engine.notificationsRepo.clearAll();
    return { success: true };
  });

  // 11. GET: /api/v1/search (OS Global fuzzy search registry routing)
  fastify.get('/api/v1/search', async (request: any) => {
    const query = (request.query.q || '').toLowerCase();
    if (!query) return [];

    const results: any[] = [];

    // Search services
    const services = await engine.getEnrichedServices();
    for (const s of services) {
      if (s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)) {
        results.push({
          type: 'service',
          id: s.id,
          title: s.name,
          subtitle: s.description,
          icon: s.id,
          action: `open-service:${s.id}`
        });
      }
    }

    // Search workspaces
    const workspaces = engine.workspacesRepo.findAll();
    for (const w of workspaces) {
      if (w.name.toLowerCase().includes(query)) {
        results.push({
          type: 'workspace',
          id: w.id,
          title: w.name,
          subtitle: `Workspace - ${w.description || 'View screen'}`,
          icon: w.icon,
          action: `navigate-workspace:${w.id}`
        });
      }
    }

    // Search categories
    const categories = engine.categoriesRepo.findAll();
    for (const c of categories) {
      if (c.name.toLowerCase().includes(query)) {
        results.push({
          type: 'category',
          id: c.id,
          title: c.name,
          subtitle: `Category - ${c.description || 'Service group'}`,
          icon: c.icon,
          action: `focus-category:${c.id}`
        });
      }
    }

    return results.slice(0, 10);
  });

  // 12. GET/POST/PUT/DELETE: /api/v1/servers (Multi-server endpoints configuration CRUD)
  fastify.get('/api/v1/servers', async () => {
    return engine.serversRepo.findAll();
  });

  fastify.post('/api/v1/servers', async (request: any) => {
    return engine.serversRepo.create(request.body);
  });

  fastify.put('/api/v1/servers/:id', async (request: any) => {
    const { id } = request.params;
    return engine.serversRepo.update(id, request.body);
  });

  fastify.delete('/api/v1/servers/:id', async (request: any) => {
    const { id } = request.params;
    return { success: engine.serversRepo.delete(id) };
  });

  // 13. GET: /api/v1/audit (Security audit log lookup query)
  fastify.get('/api/v1/audit', async (request: any) => {
    const limit = Number(request.query.limit) || 100;
    return engine.auditRepo.findAll(limit);
  });

  // 14. GET: /api/v1/apps (Dynamic Application System Registry)
  fastify.get('/api/v1/apps', async () => {
    return [
      { id: 'dashboard', name: 'Dashboard', icon: 'layout', displayOrder: 0, permissions: ['admin', 'editor', 'viewer'] },
      { id: 'containers', name: 'Containers', icon: 'server', displayOrder: 1, permissions: ['admin', 'editor'] },
      { id: 'settings', name: 'Settings', icon: 'settings', displayOrder: 2, permissions: ['admin'] },
      { id: 'terminal', name: 'Terminal', icon: 'terminal', displayOrder: 3, permissions: ['admin'] }
    ];
  });

  // 15. GET: /api/v1/docker/containers (Query all Docker containers)
  fastify.get('/api/v1/docker/containers', async () => {
    return await engine.docker.getContainers();
  });

  // 16. GET: /api/v1/docker/images (Query all Docker images)
  fastify.get('/api/v1/docker/images', async () => {
    return await engine.docker.getImages();
  });

  // 17. POST: /api/v1/docker/images (Pull a Docker image)
  fastify.post('/api/v1/docker/images', async (request: any, reply: any) => {
    const { image } = request.body || {};
    if (!image) return reply.status(400).send({ error: 'Image parameter required' });
    try {
      const res = await engine.docker.pullImage(image);
      engine.auditRepo.log('admin', 'pull_image', 'docker', image);
      return res;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 18. GET: /api/v1/docker/volumes (Query all Docker volumes)
  fastify.get('/api/v1/docker/volumes', async () => {
    return await engine.docker.getVolumes();
  });

  // 19. GET: /api/v1/docker/networks (Query all Docker networks)
  fastify.get('/api/v1/docker/networks', async () => {
    return await engine.docker.getNetworks();
  });

  // 20. GET: /api/v1/docker/stats/:id (Get container resource utilization metrics)
  fastify.get('/api/v1/docker/stats/:id', async (request: any) => {
    const { id } = request.params;
    return await engine.docker.getStats(id);
  });

  // 21. POST: /api/v1/terminal (Direct pseudo-console execution)
  fastify.post('/api/v1/terminal', async (request: any, reply: any) => {
    const { command } = request.body || {};
    try {
      const output = await engine.terminal.execute(command);
      return { output };
    } catch (err: any) {
      return reply.status(500).send({ error: `Shell command execution failed: ${err.message}` });
    }
  });

  // 22. GET: /api/v1/docs (Auto-generated OpenAPI Documentation)
  fastify.get('/api/v1/docs', async () => {
    return {
      openapi: '3.0.0',
      info: {
        title: 'HomeLab OS API Spec',
        version: '4.0.0',
        description: 'OpenAPI specification describing the modular control plane engine endpoints.'
      },
      paths: {
        '/api/v1/system': { get: { summary: 'Get host telemetry metrics snapshot' } },
        '/api/v1/services': { get: { summary: 'Get discovered plugin manifests merged with container state' } },
        '/api/v1/services/{id}/logs': { get: { summary: 'Fetch stdout/stderr logs tail for a service container' } },
        '/api/v1/services/{id}/action': { post: { summary: 'Trigger lifecycle action start/stop/restart on a container' } },
        '/api/v1/services/{id}/category': { put: { summary: 'Override the manifest category assignment for a service' } },
        '/api/v1/workspaces': {
          get: { summary: 'Get all workspaces' },
          post: { summary: 'Create a new workspace' }
        },
        '/api/v1/categories': {
          get: { summary: 'Get all categories' },
          post: { summary: 'Create a new category' }
        },
        '/api/v1/settings': {
          get: { summary: 'Retrieve settings key-value configurations' },
          put: { summary: 'Update setting variables' }
        },
        '/api/v1/notifications': { get: { summary: 'Query notifications history' } },
        '/api/v1/apps': { get: { summary: 'Get registered system applications' } },
        '/api/v1/docker/containers': { get: { summary: 'Query containers list' } },
        '/api/v1/docker/images': { get: { summary: 'Query images list' } },
        '/api/v1/docker/stats/{id}': { get: { summary: 'Query real-time resources stats for a container' } }
      }
    };
  });
}
export { PluginMetadata } from '../types';
