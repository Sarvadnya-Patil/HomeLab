// Settings preferences and security audit REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Settings preferences list query
  fastify.get('/api/v1/settings', async () => {
    return engine.settingsRepo.findAll();
  });

  // 2. Settings preferences updating
  fastify.put('/api/v1/settings', async (request: any) => {
    const prefs = request.body || {};
    for (const key of Object.keys(prefs)) {
      engine.settingsRepo.set(key, prefs[key].value, prefs[key].groupName);
    }
    engine.auditRepo.log('admin', 'update_settings', 'system', 'preferences');
    return { success: true };
  });

  // 3. Security audit log retrieval
  fastify.get('/api/v1/audit', async (request: any) => {
    const limit = Number(request.query.limit) || 100;
    return engine.auditRepo.findAll(limit);
  });
}
