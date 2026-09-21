import { test } from 'node:test';
import assert from 'assert';
import { DatabaseManager } from '../database';
import { AuthService } from '../core/services/auth.service';
import { authorize, requiredRole } from '../core/permissions';

test('AuthService Subsystem Tests', async (t) => {
  const db = new DatabaseManager(':memory:');
  const auth = new AuthService(db.getAdapter());

  await t.test('Password hashing and validation logic', () => {
    const rawPassword = 'SecurePassword123';
    const hash = auth.hashPassword(rawPassword);

    assert.ok(hash.includes(':'), 'Hashed password must contain salt separator');
    assert.strictEqual(
      hash.split(':').length,
      2,
      'Hashed password format should contain exactly two parts'
    );
  });

  await t.test('JWT token generation and verification', () => {
    // Test login verification mock logic
    db.getAdapter().run(
      'INSERT INTO users (id, username, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
      'usr-1',
      'testuser',
      auth.hashPassword('testpass'),
      'Test User',
      'admin'
    );

    const token = auth.login('testuser', 'testpass');
    assert.ok(token, 'Login should return a valid JWT token');

    const decoded = auth.verifyToken(token!);
    assert.ok(decoded, 'Verification of issued token should succeed');
    assert.strictEqual(decoded!.username, 'testuser', 'Decoded payload username must match');
    assert.strictEqual(decoded!.role, 'admin', 'Decoded payload role must match');
  });

  await t.test('Role-Based Access Control policy', () => {
    // Viewers read dashboards but cannot change anything or reach operational surfaces.
    assert.ok(authorize('viewer', 'GET', '/api/v1/metrics').allowed, 'viewer may read metrics');
    assert.ok(!authorize('viewer', 'POST', '/api/v1/services/x/action').allowed, 'viewer may not mutate');
    assert.ok(!authorize('viewer', 'GET', '/api/v1/docker/containers').allowed, 'viewer may not read docker');

    // Editors operate containers and jobs but never reach host-level configuration.
    assert.ok(authorize('editor', 'POST', '/api/v1/docker/containers/a/autostart').allowed, 'editor may operate docker');
    assert.ok(!authorize('editor', 'GET', '/api/v1/settings/desktop').allowed, 'editor may not read settings');
    assert.ok(!authorize('editor', 'POST', '/api/v1/servers').allowed, 'editor may not change servers');
    assert.ok(authorize('editor', 'GET', '/api/v1/servers').allowed, 'editor may list servers');

    assert.ok(authorize('admin', 'POST', '/api/v1/terminal').allowed, 'admin may use the terminal');

    // Every signed-in user manages their own session, including viewers.
    assert.ok(authorize('viewer', 'PUT', '/api/v1/auth/password').allowed, 'viewer may change own password');
    assert.ok(authorize('viewer', 'POST', '/api/v1/auth/logout').allowed, 'viewer may log out');
  });

  await t.test('Unlisted routes and unknown roles are denied by default', () => {
    assert.strictEqual(requiredRole('GET', '/api/v1/brand-new-endpoint'), 'admin', 'unlisted route needs admin');
    assert.strictEqual(requiredRole('POST', '/api/v1/dockerish'), 'admin', 'prefix match is per path segment');
    assert.ok(!authorize('super-admin', 'GET', '/api/v1/metrics').allowed, 'legacy role names are not honoured');
    assert.ok(!authorize(undefined, 'GET', '/api/v1/metrics').allowed, 'missing role is denied');
    assert.strictEqual(requiredRole('GET', '/api/v1/docker/containers?x=1'), 'editor', 'query string is ignored');
  });

  await t.test('Session tokens are revocable and bounded', () => {
    const created = auth.login('testuser', 'testpass');
    const session = auth.verifyToken(created!);
    assert.ok(session, 'fresh token verifies');

    auth.revokeSessions('usr-1');
    assert.strictEqual(auth.verifyToken(created!), null, 'token issued before revocation is rejected');

    const reissued = auth.login('testuser', 'testpass');
    assert.ok(auth.verifyToken(reissued!), 'a new sign-in after revocation works');

    // A session past its absolute lifetime cannot be renewed, however active it has been.
    const stale = { id: 'usr-1', username: 'testuser', role: 'admin', ss: Math.floor(Date.now() / 1000) - 13 * 3600 };
    assert.strictEqual(auth.renewToken(stale), null, 'expired session is not renewed');
    const young = { ...stale, ss: Math.floor(Date.now() / 1000) - 3600 };
    assert.ok(auth.renewToken(young), 'young session is renewed');

    db.getAdapter().run('DELETE FROM users WHERE id = ?', 'usr-1');
    assert.strictEqual(auth.verifyToken(reissued!), null, 'token of a deleted user is rejected');
  });

  await t.test('WebSocket tickets are single use', () => {
    db.getAdapter().run(
      'INSERT INTO users (id, username, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
      'usr-2', 'ticketuser', auth.hashPassword('pw'), 'Ticket User', 'admin'
    );
    const ticket = auth.issueWsTicket('usr-2');
    assert.strictEqual(auth.redeemWsTicket(ticket)?.id, 'usr-2', 'first redemption succeeds');
    assert.strictEqual(auth.redeemWsTicket(ticket), null, 'second redemption fails');
    assert.strictEqual(auth.redeemWsTicket('not-a-ticket'), null, 'unknown ticket fails');
    assert.strictEqual(auth.redeemWsTicket(undefined), null, 'missing ticket fails');
  });

  db.close();
});
