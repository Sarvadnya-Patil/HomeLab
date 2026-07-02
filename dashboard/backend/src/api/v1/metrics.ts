// Metrics REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/system (Hardware metrics snapshot)
  fastify.get('/api/v1/system', async () => {
    return engine.metrics.getLatestMetrics();
  });

  // 2. GET: /api/v1/metrics/history (Historical performance telemetry stats)
  fastify.get('/api/v1/metrics/history', async (request: any) => {
    const limit = Number(request.query.limit) || 60;
    return engine.metrics.getHistory(limit);
  });
}
