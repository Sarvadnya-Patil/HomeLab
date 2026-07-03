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

  // 3. GET: /api/v1/auth/setup-status (Check if system requires first-time initialization setup)
  fastify.get('/api/v1/auth/setup-status', async () => {
    const users = engine.usersRepo.findAll();
    return { setupRequired: users.length === 0 };
  });

  // 4. POST: /api/v1/auth/setup (Configure the first Super Admin user account during first startup setup wizard)
  fastify.post('/api/v1/auth/setup', async (request: any, reply: any) => {
    const users = engine.usersRepo.findAll();
    if (users.length > 0) {
      return reply.status(400).send({ error: 'Initialization setup is already complete' });
    }

    const { username, password, displayName } = request.body || {};
    if (!username || !password || !displayName) {
      return reply.status(400).send({ error: 'Username, password, and display name are required' });
    }

    try {
      const hashedPassword = engine.auth.hashPassword(password);
      const createdUser = engine.usersRepo.create({
        id: 'admin', // use standard admin ID to satisfy foreign keys
        username,
        password: hashedPassword,
        displayName,
        role: 'admin',
        avatar: ''
      });

      return {
        success: true,
        user: { id: createdUser.id, username: createdUser.username, role: createdUser.role }
      };
    } catch (err: any) {
      return reply.status(500).send({ error: `Setup initialization failed: ${err.message}` });
    }
  });
}
