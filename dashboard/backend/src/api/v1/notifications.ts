// Notifications history logs REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Notifications history logs list query
  fastify.get('/api/v1/notifications', async (request: any) => {
    const limit = Number(request.query.limit) || 50;
    const unreadOnly = request.query.unread === 'true';
    return engine.notifier.getHistory(limit, unreadOnly);
  });

  // 2. Mark a single notification as read
  fastify.put('/api/v1/notifications/:id/read', async (request: any) => {
    const { id } = request.params;
    return engine.notifier.markRead(Number(id));
  });

  // 3. Wipe all notification records
  fastify.delete('/api/v1/notifications/read', async () => {
    engine.notifier.clearAll();
    return { success: true };
  });
}
