// Servers clustering configurations REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Query servers registry list
  fastify.get('/api/v1/servers', async () => {
    return engine.serversRepo.findAll();
  });

  // 2. Add remote server target details
  fastify.post('/api/v1/servers', async (request: any) => {
    return engine.serversRepo.create(request.body);
  });

  // 3. Update server properties
  fastify.put('/api/v1/servers/:id', async (request: any) => {
    const { id } = request.params;
    return engine.serversRepo.update(id, request.body);
  });

  // 4. Wipe server target from cluster scope
  fastify.delete('/api/v1/servers/:id', async (request: any) => {
    const { id } = request.params;
    return { success: engine.serversRepo.delete(id) };
  });
}
