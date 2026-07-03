import { test } from 'node:test';
import assert from 'assert';
import fastify from 'fastify';
import { CoreEngine } from '../core/engine';
import registerRoutes from '../api/routes';
import { ServiceRegistry } from '../core/registry';

test('Fastify REST API Subsystem Tests', async (t) => {
  // Override environment settings
  process.env.JWT_SECRET = 'test-secret-key-32-chars-long-12345';
  process.env.DOCKER_PROXY_URL = 'http://127.0.0.1:2375';

  ServiceRegistry.resetInstance();
  const app = fastify();
  const engine = new CoreEngine(app);
  await engine.init(':memory:');

  registerRoutes(app, engine);

  await t.test('GET /api/v1/apps (Dynamic Applications list)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/apps'
    });

    assert.strictEqual(res.statusCode, 200, 'Apps endpoint should respond with status code 200');

    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body), 'Response payload must be an array');
    assert.ok(
      body.some((a) => a.id === 'dashboard'),
      'Dashboard application must be exposed'
    );
  });

  await t.test('GET /api/v1/health (System status check)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    assert.strictEqual(res.statusCode, 200, 'Health endpoint should respond with status code 200');

    const body = JSON.parse(res.body);
    assert.strictEqual(
      body.subsystems.database.status,
      'online',
      'Database state should report online'
    );
  });

  engine.stop();
});
