// Backup & Restore REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. POST: /api/v1/backups/db (Trigger SQLite configuration database backup copy)
  fastify.post('/api/v1/backups/db', async () => {
    const job = await engine.backup.backupDatabase();
    return { success: true, jobId: job.id };
  });

  // 2. POST: /api/v1/backups/plugin/:pluginId (Trigger plugin volume compression backups)
  fastify.post('/api/v1/backups/plugin/:pluginId', async (request: any, reply: any) => {
    const { pluginId } = request.params;

    // Query plugin manifest from DB cache
    const cached = engine.registry.db
      .getAdapter()
      .get<{ manifest: string }>('SELECT manifest FROM plugin_meta WHERE service_id = ?', pluginId);
    if (!cached) {
      return reply.status(404).send({ error: `Plugin metadata for [${pluginId}] not found.` });
    }

    const manifest = JSON.parse(cached.manifest);
    const job = await engine.backup.backupPlugin(pluginId, manifest);
    return { success: true, jobId: job.id };
  });

  // 3. POST: /api/v1/backups/restore (Trigger configurations database restore)
  fastify.post('/api/v1/backups/restore', async (request: any, reply: any) => {
    const { backupFile } = request.body || {};
    if (!backupFile) {
      return reply.status(400).send({ error: 'Missing backupFile parameters.' });
    }
    try {
      const job = await engine.backup.restoreDatabase(backupFile);
      return { success: true, jobId: job.id };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
