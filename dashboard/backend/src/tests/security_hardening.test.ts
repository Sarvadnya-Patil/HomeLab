import { test } from 'node:test';
import assert from 'assert';
import crypto from 'crypto';
import fastify from 'fastify';

// The security module resolves its key when first loaded, and static imports are hoisted above
// these assignments, so every application module below is imported dynamically after them.
process.env.JWT_SECRET = 'test-secret-key-32-chars-long-12345';
process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-not-a-real-secret';
process.env.DOCKER_PROXY_URL = 'http://127.0.0.1:2375';

const LEGACY_KEY_STRING = 'homelab-2fa-smtp-master-secret-key-32b-seed';

async function buildApp() {
  const { CoreEngine } = await import('../core/engine');
  const { default: registerRoutes } = await import('../api/routes');
  const { ServiceRegistry } = await import('../core/registry');
  ServiceRegistry.resetInstance();
  const app = fastify();
  const engine = new CoreEngine(app);
  await engine.init(':memory:');
  registerRoutes(app, engine);
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/setup',
    payload: { username: 'owner', password: 'correct-horse-battery', displayName: 'Owner' }
  });
  return { app, engine };
}

const login = (app: any, username: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });

test('Security hardening', async (t) => {
  await t.test('login gives the same answer for an unknown user and a wrong password', async () => {
    const { app, engine } = await buildApp();

    const unknown = await login(app, 'nobody', 'whatever-password');
    const wrong = await login(app, 'owner', 'wrong-password');

    assert.strictEqual(unknown.statusCode, 401);
    assert.strictEqual(wrong.statusCode, 401);
    assert.deepStrictEqual(JSON.parse(unknown.body), JSON.parse(wrong.body));

    engine.stop();
  });

  await t.test('login is blocked after repeated failures and reports Retry-After', async () => {
    const { app, engine } = await buildApp();

    for (let i = 0; i < 5; i++) {
      const res = await login(app, 'owner', 'wrong-password');
      assert.strictEqual(res.statusCode, 401, `attempt ${i + 1} should be a plain failure`);
    }

    const blocked = await login(app, 'owner', 'wrong-password');
    assert.strictEqual(blocked.statusCode, 429);
    assert.ok(Number(blocked.headers['retry-after']) > 0, 'Retry-After header must be set');

    // The correct password is refused too while the block is active.
    const blockedCorrect = await login(app, 'owner', 'correct-horse-battery');
    assert.strictEqual(blockedCorrect.statusCode, 429);

    engine.stop();
  });

  await t.test('a successful login clears the failure counter', async () => {
    const { app, engine } = await buildApp();

    for (let i = 0; i < 4; i++) await login(app, 'owner', 'wrong-password');
    const ok = await login(app, 'owner', 'correct-horse-battery');
    assert.strictEqual(ok.statusCode, 200);

    for (let i = 0; i < 4; i++) {
      const res = await login(app, 'owner', 'wrong-password');
      assert.strictEqual(res.statusCode, 401, 'counter should have restarted from zero');
    }

    engine.stop();
  });

  await t.test('a spoofed X-Forwarded-For header does not select a new rate-limit bucket', async () => {
    const { app, engine } = await buildApp();

    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
        payload: { username: 'owner', password: 'wrong-password' }
      });
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-forwarded-for': '10.9.9.9' },
      payload: { username: 'owner', password: 'wrong-password' }
    });
    assert.strictEqual(res.statusCode, 429);

    engine.stop();
  });

  await t.test('autostart rejects container identifiers that are not plain names or IDs', async () => {
    const { app, engine } = await buildApp();
    const token = (engine.auth as any).signJwt({ id: 'admin', username: 'owner', role: 'admin' });

    for (const badId of ['x; touch /tmp/pwned', '$(id)', '--privileged', 'a b', '`id`']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/docker/containers/${encodeURIComponent(badId)}/autostart`,
        headers: { authorization: `Bearer ${token}` },
        payload: { enabled: true }
      });
      assert.strictEqual(res.statusCode, 400, `identifier ${JSON.stringify(badId)} must be rejected`);
    }

    engine.stop();
  });

  await t.test('secrets round-trip and legacy-key ciphertext stays readable', async () => {
    const { encryptSecret, decryptSecret } = await import('../utils/security');

    const stored = encryptSecret('smtp-app-password');
    assert.ok(stored.startsWith('enc:gcm:'));
    assert.strictEqual(decryptSecret(stored), 'smtp-app-password');

    // Ciphertext written by an older release, which used the built-in default key.
    const legacyKey = crypto.createHash('sha256').update(LEGACY_KEY_STRING).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    const body = cipher.update('old-password', 'utf8', 'hex') + cipher.final('hex');
    const legacyPayload = `enc:gcm:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body}`;
    assert.strictEqual(decryptSecret(legacyPayload), 'old-password');

    // Tampered ciphertext must fail closed rather than return garbage.
    const parts = stored.split(':');
    parts[4] = parts[4].replace(/^./, (c) => (c === '0' ? '1' : '0'));
    assert.strictEqual(decryptSecret(parts.join(':')), '');
  });
});
