// Authentication and Session REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. POST: /api/v1/auth/login (Verify credentials and issue signed token)
  fastify.post('/api/v1/auth/login', async (request: any, reply: any) => {
    const { username, password } = request.body || {};
    const token = engine.auth.login(username, password);
    if (!token) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }
    return { token };
  });

  // 2. GET: /api/v1/auth/me (Extract profile state from Bearer token)
  fastify.get('/api/v1/auth/me', async (request: any, reply: any) => {
    const authHeader = request.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const user = engine.auth.verifyToken(token);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }
    return user;
  });
}
