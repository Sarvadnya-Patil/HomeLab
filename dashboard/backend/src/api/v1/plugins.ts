import { CoreEngine } from '../../core/engine';
import { execSync } from 'child_process';
import { Logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs';

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

    const match = dockerContainers.find((c) =>
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
    const actor = request.user?.id || 'admin';

    const job = await engine.jobs.executeAsyncTask(
      `container_${action}`,
      id,
      async (updateProgress) => {
        updateProgress(20);
        // Handle container removal cache pruning
        if (action === 'remove') {
          try {
            const cacheFilePath = path.join(process.cwd(), 'data', 'compose_cache.json');
            if (fs.existsSync(cacheFilePath)) {
              const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
              if (cache[id]) {
                delete cache[id];
                fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
              }
            }
          } catch (err: any) {
            Logger.error('PluginsSubsystem', `Failed to prune from compose cache: ${err.message}`);
          }
        }

        const dockerContainers = await engine.docker.getContainers();
        const match = dockerContainers.find((c) =>
          c.Names.some((name: string) => name === `/${id}` || name.endsWith(`-${id}`))
        );
        if (!match && action !== 'start' && action !== 'remove') {
          throw new Error(`No container found matching service ID [${id}]`);
        }

        updateProgress(50);
        const containerId = match ? match.Id : null;
        if (containerId || action !== 'remove') {
          await engine.docker.executeAction(containerId, id, action, actor);
        }
        updateProgress(90);

        // Notify event log
        engine.notifier.notify(
          id,
          `Job [${action.toUpperCase()}] execution completed on host container.`,
          'info'
        );
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
    const cached = engine.registry.db
      .getAdapter()
      .get<{ manifest: string }>('SELECT manifest FROM plugin_meta WHERE service_id = ?', id);
    if (!cached) return { schema: [], values: {} };

    const manifest = JSON.parse(cached.manifest);
    const schema = manifest.settings || [];

    const values: any = {};
    for (const field of schema) {
      const dbKey = `plugin.${id}.${field.key}`;
      const val = engine.settingsRepo.get(dbKey);
      values[field.key] =
        val !== undefined ? val : field.default !== undefined ? field.default : '';
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

    const actor = request.user?.id || 'admin';
    engine.auditRepo.log(actor, 'update_plugin_settings', 'plugin', id, body);
    return { success: true };
  });

  // 8. POST: /api/v1/services/:id/compose-up (Recreate container from its Compose definition)
  fastify.post('/api/v1/services/:id/compose-up', async (request: any) => {
    const { id } = request.params;
    const actor = request.user?.id || 'admin';

    // Resolve the service directory, checking the compose cache first for external folders
    let serviceDir = path.join(engine.plugin.getServicesDir(), id);
    let composeFile = 'docker-compose.yml';

    try {
      const cacheFilePath = path.join(process.cwd(), 'data', 'compose_cache.json');
      if (fs.existsSync(cacheFilePath)) {
        const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        if (cache[id] && cache[id].workingDir && fs.existsSync(cache[id].workingDir)) {
          serviceDir = cache[id].workingDir;
          if (cache[id].configFiles) {
            // Read basename (e.g. docker-compose.yml or docker-compose.yaml)
            composeFile = path.basename(cache[id].configFiles.split(',')[0]);
          }
        }
      }
    } catch {
      // Fallback silently to default local services folder
    }

    if (!fs.existsSync(serviceDir)) {
      throw { statusCode: 404, message: `Compose folder not found for [${id}]. Cannot recreate.` };
    }

    // Locate compose file path
    const composePath = path.join(serviceDir, composeFile);
    if (!fs.existsSync(composePath)) {
      throw { statusCode: 404, message: `Compose file [${composeFile}] not found in directory [${serviceDir}].` };
    }

    const job = await engine.jobs.executeAsyncTask(
      'compose_up',
      id,
      async (updateProgress) => {
        updateProgress(10, `Resolving compose definition for service [${id}]...`);

        try {
          updateProgress(30, `Running: docker compose -f ${composeFile} up -d`);
          const output = execSync(`docker compose -f ${composeFile} up -d --build`, {
            cwd: serviceDir,
            timeout: 120000,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
          updateProgress(80, output || 'Compose stack launched successfully.');
        } catch (err: any) {
          const stderr = err.stderr || err.message;
          throw new Error(`Compose up failed: ${stderr}`);
        }

        updateProgress(90, 'Refreshing plugin discovery registry...');
        engine.plugin.discover();

        engine.notifier.notify(
          id,
          `Service [${id}] recreated via docker compose up.`,
          'info'
        );
        updateProgress(100, `Service [${id}] recreated successfully.`);
      }
    );

    engine.auditRepo.log(actor, 'compose_up', 'service', id, { composeFile });
    return { success: true, jobId: job.id };
  });
}
