import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/health (Query health reports for core subsystems)
  fastify.get('/api/v1/health', async () => {
    return await engine.infrastructure.getHealthStatus();
  });
}
