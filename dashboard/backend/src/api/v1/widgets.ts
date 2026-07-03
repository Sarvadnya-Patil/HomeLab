// Workspaces, Categories, and Widgets REST Subsystem API routes
import { CoreEngine } from '../../core/engine';
import { randomUUID } from 'crypto';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Workspaces CRUD
  fastify.get('/api/v1/workspaces', async () => {
    return engine.workspacesRepo.findAll();
  });

  fastify.post('/api/v1/workspaces', async (request: any) => {
    const data = request.body || {};
    if (!data.id) {
      data.id = randomUUID();
    }
    return engine.workspacesRepo.create(data);
  });

  fastify.put('/api/v1/workspaces/:id', async (request: any) => {
    const { id } = request.params;
    return engine.workspacesRepo.update(id, request.body);
  });

  fastify.delete('/api/v1/workspaces/:id', async (request: any) => {
    const { id } = request.params;
    engine.widgetsRepo.deleteByWorkspace(id);
    return { success: engine.workspacesRepo.delete(id) };
  });

  // 2. Categories CRUD
  fastify.get('/api/v1/categories', async () => {
    const list = engine.categoriesRepo.findAll();
    if (!list.some(c => c.id === 'containers' || c.name.toLowerCase() === 'containers')) {
      list.push({
        id: 'containers',
        workspaceId: 'overview',
        name: 'Containers',
        icon: 'server',
        description: 'Auto-discovered Docker host container instances',
        displayOrder: 10,
        collapsed: false,
        visible: true
      } as any);
    }
    return list;
  });

  fastify.post('/api/v1/categories', async (request: any) => {
    const data = request.body || {};
    if (!data.id) {
      data.id = randomUUID();
    }
    return engine.categoriesRepo.create(data);
  });

  fastify.put('/api/v1/categories/:id', async (request: any) => {
    const { id } = request.params;
    return engine.categoriesRepo.update(id, request.body);
  });

  fastify.delete('/api/v1/categories/:id', async (request: any) => {
    const { id } = request.params;
    return { success: engine.categoriesRepo.delete(id) };
  });

  // 3. Widgets positions layout queries
  fastify.get('/api/v1/workspaces/:workspaceId/widgets', async (request: any) => {
    const { workspaceId } = request.params;
    return engine.widgetsRepo.findByWorkspace(workspaceId);
  });

  fastify.post('/api/v1/workspaces/:workspaceId/widgets', async (request: any) => {
    const { workspaceId } = request.params;
    const list = request.body || [];
    engine.widgetsRepo.saveLayout(workspaceId, list);
    return { success: true };
  });
}
