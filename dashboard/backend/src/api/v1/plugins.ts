// Plugins and Services discovery and lifecycle REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/plugins (Query list of discovered plugin manifests)
  fastify.get('/api/v1/plugins', async () => {
    return engine.plugin.discover();
  });

  // 2. GET: /api/v1/services (Query discovered services merged with container state)
  fastify.get('/api/v1/services', async () => {
    return await engine.getEnrichedServices();
  });

  // 3. GET: /api/v1/services/:id/logs (Fetch logs tail for a service container)
  fastify.get('/api/v1/services/:id/logs', async (request: any, reply: any) => {
    const { id } = request.params;
    
    let dockerContainers = [];
    try {
      dockerContainers = await engine.docker.getContainers();
    } catch {
      return { logs: `[DOCKER OFFLINE] Docker daemon is unreachable.` };
    }
    
    const match = dockerContainers.find(c => 
      c.Names.some((name: string) => name === `/${id}` || name.endsWith(`-${id}`))
    );
    if (!match) {
      return { logs: `Container for service ID [${id}] is not currently deployed.` };
    }
    
    try {
      const logs = await engine.docker.getLogs(match.Id, id);
      return { logs };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to query logs: ${err.message}` });
    }
  });

  // 4. POST: /api/v1/services/:id/action (Asynchronously trigger container action via the Job Engine)
  fastify.post('/api/v1/services/:id/action', async (request: any) => {
    const { id } = request.params;
    const { action } = request.body || {};

    const job = await engine.jobs.executeAsyncTask(
      `container_${action}`,
      id,
      async (updateProgress) => {
        updateProgress(20);
        const dockerContainers = await engine.docker.getContainers();
        const match = dockerContainers.find(c => 
          c.Names.some((name: string) => name === `/${id}` || name.endsWith(`-${id}`))
        );
        if (!match && action !== 'start') {
          throw new Error(`No container found matching service ID [${id}]`);
        }
        
        updateProgress(50);
        const containerId = match ? match.Id : null;
        await engine.docker.executeAction(containerId, id, action);
        updateProgress(90);
        
        // Notify event log
        engine.notifier.notify(id, `Job [${action.toUpperCase()}] execution completed on host container.`, 'info');
      }
    );

    return { success: true, jobId: job.id };
  });

  // 5. PUT: /api/v1/services/:id/category (Override service category override mapping)
  fastify.put('/api/v1/services/:id/category', async (request: any) => {
    const { id } = request.params;
    const { categoryId, serverId } = request.body || {};
    
    engine.registry.category.saveServiceOverride(id, categoryId, serverId || 'local');
    
    // Broadcast update
    const updated = await engine.getEnrichedServices();
    engine.broadcast({ type: 'services', data: updated });
    return { success: true };
  });

  // 6. GET: /api/v1/plugins/:id/settings (Fetch dynamic schema and saved values)
  fastify.get('/api/v1/plugins/:id/settings', async (request: any) => {
    const { id } = request.params;
    const cached = engine.registry.db.getAdapter().get<{ manifest: string }>(
      'SELECT manifest FROM plugin_meta WHERE service_id = ?',
      id
    );
    if (!cached) return { schema: [], values: {} };

    const manifest = JSON.parse(cached.manifest);
    const schema = manifest.settings || [];
    
    const values: any = {};
    for (const field of schema) {
      const dbKey = `plugin.${id}.${field.key}`;
      const val = engine.settingsRepo.get(dbKey);
      values[field.key] = val !== undefined ? val : (field.default !== undefined ? field.default : '');
    }

    return { schema, values };
  });

  // 7. PUT: /api/v1/plugins/:id/settings (Persist custom settings parameters)
  fastify.put('/api/v1/plugins/:id/settings', async (request: any) => {
    const { id } = request.params;
    const body = request.body || {};

    for (const key of Object.keys(body)) {
      const dbKey = `plugin.${id}.${key}`;
      engine.settingsRepo.set(dbKey, String(body[key]), 'plugin-settings');
    }

    engine.auditRepo.log('admin', 'update_plugin_settings', 'plugin', id, body);
    return { success: true };
  });
}
