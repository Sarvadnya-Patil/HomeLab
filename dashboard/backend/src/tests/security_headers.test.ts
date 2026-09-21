import { test } from 'node:test';
import assert from 'assert';
import fastify from 'fastify';
import {
  buildContentSecurityPolicy,
  registerSecurityHeaders,
  resolveFrameAncestors
} from '../api/security-headers';

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((d) => d.startsWith(`${name} `));
  return found ? found.slice(name.length + 1) : '';
}

test('Security response headers', async (t) => {
  await t.test('every response carries the hardening headers', async () => {
    const app = fastify();
    registerSecurityHeaders(app);
    app.get('/api/v1/probe', async () => ({ ok: true }));
    app.get('/index.html', async () => 'page');

    const api = await app.inject({ method: 'GET', url: '/api/v1/probe', headers: { host: 'dash.local:8081' } });
    assert.strictEqual(api.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(api.headers['x-frame-options'], 'DENY');
    assert.strictEqual(api.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(api.headers['cross-origin-opener-policy'], 'same-origin');
    assert.strictEqual(api.headers['cache-control'], 'no-store', 'API responses must not be cached');
    assert.strictEqual(api.headers['access-control-allow-origin'], undefined, 'no cross-origin access is granted');
    assert.strictEqual(api.headers['strict-transport-security'], undefined, 'HSTS is not sent over plain http');

    const page = await app.inject({ method: 'GET', url: '/index.html' });
    assert.ok(page.headers['content-security-policy'], 'static pages get a CSP too');
    assert.strictEqual(page.headers['cache-control'], undefined, 'non-API responses keep their own caching');

    await app.close();
  });

  await t.test('the policy forbids inline script, eval and foreign origins', () => {
    const csp = buildContentSecurityPolicy('dash.local:8081', "'none'");
    const scripts = directive(csp, 'script-src');

    assert.strictEqual(
      scripts,
      "'self' https://cdn.jsdelivr.net/npm/xterm@5.3.0/ https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/"
    );
    assert.ok(!scripts.includes('unsafe-inline') && !scripts.includes('unsafe-eval'), 'no inline script or eval');
    assert.ok(!/https:\/\/cdn\.jsdelivr\.net(?!\/)/.test(csp), 'the CDN is never allowed as a whole host');
    assert.ok(directive(csp, 'img-src').includes('https://cdn.jsdelivr.net/gh/selfhst/icons@main/'), 'logo path is allowed');
    assert.strictEqual(directive(csp, 'default-src'), "'self'");
    assert.strictEqual(directive(csp, 'object-src'), "'none'");
    assert.strictEqual(directive(csp, 'frame-ancestors'), "'none'");
    assert.ok(
      directive(csp, 'connect-src').startsWith("'self' ws://dash.local:8081 wss://dash.local:8081"),
      'connect-src allows this origin and its WebSocket'
    );
  });

  await t.test('a malformed Host header cannot inject extra CSP directives', () => {
    const csp = buildContentSecurityPolicy("evil.example; script-src *", "'none'");
    assert.ok(!directive(csp, 'script-src').includes('*'), 'a hostile Host value cannot open script-src');
    assert.ok(!csp.includes('evil.example'), 'the hostile value is not echoed into the policy');
  });

  await t.test('FRAME_ANCESTORS is validated before it reaches the policy', () => {
    assert.strictEqual(resolveFrameAncestors(undefined), "'none'");
    assert.strictEqual(resolveFrameAncestors("'self' https://home.example.com"), "'self' https://home.example.com");
    assert.strictEqual(resolveFrameAncestors("'self'; script-src *"), "'none'", 'a semicolon is rejected');
    assert.strictEqual(resolveFrameAncestors("'self'\r\nX-Injected: 1"), "'none'", 'a line break is rejected');
  });
});
