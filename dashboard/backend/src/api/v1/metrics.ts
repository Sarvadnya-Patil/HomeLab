// Metrics REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/system (Hardware metrics snapshot)
  fastify.get('/api/v1/system', async () => {
    return engine.infrastructure.getMetrics();
  });

  // 2. GET: /api/v1/metrics/history (Historical performance telemetry stats)
  fastify.get('/api/v1/metrics/history', async (request: any) => {
    const limit = Number(request.query.limit) || 60;
    return engine.metrics.getHistory(limit);
  });

  // 3. GET: /api/v1/system/header (Unified endpoint returning all header information in one response)
  fastify.get('/api/v1/system/header', async () => {
    const health = await engine.infrastructure.getHealthStatus();
    const stats = engine.infrastructure.getMetrics();
    
    return {
      hostname: stats ? stats.hostname : 'homelab-host',
      osName: stats ? stats.osName : 'Linux Server',
      kernel: stats ? stats.kernel : 'Unknown Kernel',
      uptime: stats ? stats.uptime : '0s',
      currentTime: new Date().toISOString(),
      subsystems: health.subsystems
    };
  });
}
