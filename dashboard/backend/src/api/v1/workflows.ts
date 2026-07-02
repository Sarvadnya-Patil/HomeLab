// Workflow automation engine REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/workflows (Query all registered workflows)
  fastify.get('/api/v1/workflows', async () => {
    return engine.workflow.getRules();
  });

  // 2. POST: /api/v1/workflows (Create/register a new automation rule)
  fastify.post('/api/v1/workflows', async (request: any) => {
    return engine.workflow.createRule(request.body);
  });

  // 3. DELETE: /api/v1/workflows/:id (Remove automation rule)
  fastify.delete('/api/v1/workflows/:id', async (request: any) => {
    const { id } = request.params;
    return { success: engine.workflow.deleteRule(id) };
  });
}
