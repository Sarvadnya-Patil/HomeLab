// Master REST API Route Coordinator loading modular v1 route endpoints
import { exec } from 'child_process';
import { CoreEngine } from '../core/engine';
import { authorize } from '../core/permissions';
import { hostAccessEnabled } from '../utils/host-access';

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
import backupsRoutes from './v1/backups';
import dockerRoutes from './v1/docker';

// Endpoints reachable without a session token: sign-in, first-run setup, and read-only status.
const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/setup',
  '/api/v1/auth/setup-status',
  '/api/v1/auth/2fa-verify',
  '/api/v1/auth/2fa-email-confirm',
  '/api/v1/health',
  '/api/v1/apps',
  '/api/v1/docs',
  '/api/v1/system/header'
];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Standard Response Envelope serialization hook
  fastify.addHook('preSerialization', async (request: any, reply: any, payload: any) => {
    const url = request.url || '';
    if (!url.startsWith('/api/v1/')) {
      return payload;
    }
    if (isPublicPath(url)) {
      return payload;
    }
    if (payload && typeof payload === 'object') {
      if ('success' in payload || 'error' in payload || 'statusCode' in payload) {
        return payload;
      }
    }
    return { success: true, data: payload };
  });

  // 2. Standard Error Envelope handler
  fastify.setErrorHandler((error: any, request: any, reply: any) => {
    const statusCode = error.statusCode || 500;
    const url = request.url || '';
    if (url.startsWith('/api/v1/')) {
      let friendlyMessage = error.message || 'Internal Server Error';

      // Rewrite Fastify validation errors (AJV) into clean human-readable statements
      if (error.validation && error.validation.length > 0) {
        const vError = error.validation[0];
        const rawField = vError.instancePath ? vError.instancePath.replace(/^\//, '') : (vError.params?.missingProperty || 'field');
        // Camel case to separate words for readability
        const field = rawField.replace(/([A-Z])/g, ' $1').toLowerCase();

        if (vError.keyword === 'minLength') {
          friendlyMessage = `The ${field} must be at least ${vError.params.limit} characters long.`;
        } else if (vError.keyword === 'maxLength') {
          friendlyMessage = `The ${field} cannot exceed ${vError.params.limit} characters.`;
        } else if (vError.keyword === 'required') {
          friendlyMessage = `The ${field} is required.`;
        } else if (vError.keyword === 'pattern') {
          friendlyMessage = `The ${field} format is invalid.`;
        } else {
          friendlyMessage = `Invalid input: ${error.message}`;
        }
      }

      reply.status(statusCode).send({
        success: false,
        error: {
          message: friendlyMessage,
          code: error.validation ? 'VALIDATION_ERROR' : (error.code || 'INTERNAL_ERROR')
        }
      });
    } else {
      reply.status(statusCode).send(error);
    }
  });

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

    // Attribute the entry to the identity verified by the auth hook, falling back to the system user
    let userId = 'system';
    if (request.user && request.user.id) {
      userId = request.user.id;
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

  // Enforce JWT Auth globally on v1 endpoints (except sign-in, setup and public status endpoints)
  fastify.addHook('preHandler', async (request: any, reply: any) => {
    const url = request.url || '';
    if (!url.startsWith('/api/v1/')) {
      return;
    }

    if (isPublicPath(url)) {
      return;
    }

    const authHeader = request.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const user = engine.auth.verifyToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    request.user = user;

    // Sliding session auto-renewal: if token has < 30 minutes left, send a renewed token in headers.
    // Renewal stops once the session reaches its absolute lifetime, forcing a fresh sign-in.
    if (user.exp) {
      const timeLeft = user.exp - Math.floor(Date.now() / 1000);
      if (timeLeft > 0 && timeLeft < 1800) {
        const renewedToken = engine.auth.renewToken(user);
        if (renewedToken) {
          reply.header('Access-Control-Expose-Headers', 'X-Renewed-Token');
          reply.header('X-Renewed-Token', renewedToken);
        }
      }
    }

    // Role-based access control: one policy table (core/permissions.ts), denied unless listed
    const decision = authorize(user.role, request.method, url);
    if (!decision.allowed) {
      return reply.status(403).send({ error: `Forbidden: ${decision.required} privilege required` });
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
  backupsRoutes(fastify, engine);
  dockerRoutes(fastify, engine);

  // 1. GET: /api/v1/apps (Dynamic Application Registry)
  fastify.get('/api/v1/apps', async () => {
    const desktopEnabled = engine.settingsRepo.get('desktop.rdp.enabled') === 'true';
    let serviceActive = false;

    if ((engine as any).simulatedServiceActive) {
      serviceActive = true;
    } else if (process.platform === 'linux' && hostAccessEnabled()) {
      try {
        const checkCmd = 'nsenter -t 1 -m -u -i -n -p -r -- /bin/sh -c "systemctl is-active homelab-desktop-streamer"';
        const stdout = await new Promise<string>((resolve) => {
          exec(checkCmd, (err, stdout) => resolve(stdout.trim()));
        });
        serviceActive = stdout === 'active';
      } catch {
        // ignore
      }
    }

    const apps = [
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
        name: 'Topology',
        icon: 'topology',
        displayOrder: 2,
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
        icon: 'zap',
        displayOrder: 5,
        permissions: ['admin', 'editor']
      },
      {
        id: 'terminal',
        name: 'Terminal',
        icon: 'terminal',
        displayOrder: 6,
        permissions: ['admin']
      }
    ];

    if (desktopEnabled || serviceActive) {
      apps.push({
        id: 'desktop',
        name: 'Remote Desktop',
        icon: 'monitor',
        displayOrder: 6.5,
        permissions: ['admin']
      });
    }

    apps.push({
      id: 'settings',
      name: 'Settings',
      icon: 'settings',
      displayOrder: 7,
      permissions: ['admin']
    });

    return apps;
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
