// Master REST API Route Coordinator loading modular v1 route endpoints
import { CoreEngine } from '../core/engine';

// Import modular API route subsystems
import metricsRoutes from './v1/metrics';
import widgetsRoutes from './v1/widgets';
import settingsRoutes from './v1/settings';
import notificationsRoutes from './v1/notifications';
import serversRoutes from './v1/servers';
import jobsRoutes from './v1/jobs';
import healthRoutes from './v1/health';
import pluginsRoutes from './v1/plugins';
import searchRoutes from './v1/search';
import designerRoutes from './v1/designer';
import authRoutes from './v1/auth';
import workflowsRoutes from './v1/workflows';
import backupsRoutes from './v1/backups';

export default function (fastify: any, engine: CoreEngine): void {
  // Centralized Audit Middleware Hook
  fastify.addHook('onResponse', async (request: any, reply: any) => {
    const method = request.method;
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      return;
    }

    const pathStr = request.url || '';
    if (!pathStr.startsWith('/api/v1/')) {
      return;
    }

    // Determine client IP address
    const clientIp = request.ip || request.headers['x-forwarded-for'] || '127.0.0.1';

    // Parse authenticated user ID from authorization header if available
    let userId = 'system';
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = engine.auth.verifyToken(token);
        if (decoded && decoded.id) {
          userId = decoded.id;
        }
      } catch {
        // Suppress parsing errors for invalid/anonymous JWT tokens
      }
    }

    // Parse url path components to extract resource type and entity ID
    // e.g. /api/v1/plugins/portainer/settings -> resource: plugins, entityId: portainer, action: settings
    const parts = pathStr.split('?')[0].split('/').filter(Boolean);
    const resource = parts[2] || 'general';
    const entityId = parts[3] || null;
    const subAction = parts[4] || '';
    const action = `${method}:${subAction ? `${subAction}` : entityId || 'mutate'}`;

    const statusCode = reply.statusCode;
    const isSuccess = statusCode >= 200 && statusCode < 300;

    try {
      engine.auditRepo.log(
        userId,
        action,
        resource,
        entityId,
        {
          path: pathStr,
          statusCode: statusCode,
          success: isSuccess
        },
        clientIp
      );
    } catch {
      // Suppress audit logging failures
    }
  });

  // Load modular v1 routes
  metricsRoutes(fastify, engine);
  widgetsRoutes(fastify, engine);
  settingsRoutes(fastify, engine);
  notificationsRoutes(fastify, engine);
  serversRoutes(fastify, engine);
  jobsRoutes(fastify, engine);
  healthRoutes(fastify, engine);
  pluginsRoutes(fastify, engine);
  searchRoutes(fastify, engine);
  designerRoutes(fastify, engine);
  authRoutes(fastify, engine);
  workflowsRoutes(fastify, engine);
  backupsRoutes(fastify, engine);

  // 1. GET: /api/v1/apps (Dynamic Application Registry)
  fastify.get('/api/v1/apps', async () => {
    return [
      {
        id: 'dashboard',
        name: 'Dashboard',
        icon: 'layout',
        displayOrder: 0,
        permissions: ['admin', 'editor', 'viewer']
      },
      {
        id: 'containers',
        name: 'Containers',
        icon: 'server',
        displayOrder: 1,
        permissions: ['admin', 'editor']
      },
      {
        id: 'designer',
        name: 'Designer',
        icon: 'map',
        displayOrder: 2,
        permissions: ['admin', 'editor']
      },
      {
        id: 'workflows',
        name: 'Automation',
        icon: 'activity',
        displayOrder: 3,
        permissions: ['admin', 'editor']
      },
      {
        id: 'health',
        name: 'System Health',
        icon: 'activity',
        displayOrder: 4,
        permissions: ['admin', 'editor', 'viewer']
      },
      {
        id: 'jobs',
        name: 'Job Center',
        icon: 'terminal',
        displayOrder: 5,
        permissions: ['admin', 'editor']
      },
      {
        id: 'settings',
        name: 'Settings',
        icon: 'settings',
        displayOrder: 6,
        permissions: ['admin']
      }
    ];
  });

  // 2. POST: /api/v1/terminal (Direct pseudo-console execution)
  fastify.post('/api/v1/terminal', async (request: any, reply: any) => {
    const { command } = request.body || {};
    try {
      const output = await engine.terminal.execute(command);
      return { output };
    } catch (err: any) {
      return reply.status(500).send({ error: `Shell command execution failed: ${err.message}` });
    }
  });

  // 3. GET: /api/v1/docs (OpenAPI specs)
  fastify.get('/api/v1/docs', async () => {
    return {
      openapi: '3.0.0',
      info: {
        title: 'HomeLab OS API Spec',
        version: '5.0.0',
        description: 'Modular v1 OpenAPI specs for the HomeLab OS central control plane.'
      }
    };
  });
}
export { PluginMetadata } from '../types';
