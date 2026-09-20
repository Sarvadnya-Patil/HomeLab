import { test } from 'node:test';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { applyStaticCacheHeaders } from '../api/static-assets';
import { registerSecurityHeaders } from '../api/security-headers';

test('Static frontend serving', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homelab-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>t</title>');
  fs.writeFileSync(path.join(root, 'app.js'), 'export {};');
  fs.writeFileSync(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  // Mirrors the wiring in server.ts: security headers first, then the real static plugin. A
  // regression here (such as a plugin upgrade changing what setHeaders receives) crashes the
  // process on the first page load, which no route-level test would notice.
  const app = fastify();
  registerSecurityHeaders(app);
  app.register(staticPlugin, { root, prefix: '/', setHeaders: applyStaticCacheHeaders });
  await app.ready();

  await t.test('HTML and scripts are served and must be revalidated on every load', async () => {
    for (const url of ['/index.html', '/app.js']) {
      const res = await app.inject({ method: 'GET', url });
      assert.strictEqual(res.statusCode, 200, `${url} is served`);
      assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate', `${url} is not cached`);
      assert.strictEqual(res.headers['pragma'], 'no-cache');
    }
  });

  await t.test('static responses also carry the security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/index.html' });
    assert.ok(res.headers['content-security-policy'], 'CSP is present on the page');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });

  await t.test('other assets keep their default caching', async () => {
    const res = await app.inject({ method: 'GET', url: '/logo.png' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(!String(res.headers['cache-control']).includes('no-store'), 'images are not forced to no-store');
  });

  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});
