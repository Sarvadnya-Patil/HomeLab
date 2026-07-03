import { test } from 'node:test';
import assert from 'assert';
import { DatabaseManager } from '../database';
import { AuthService } from '../core/services/auth.service';

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

  await t.test('Role-Based Access Control permissions mapping', () => {
    assert.ok(
      auth.hasPermission('super-admin', 'any_permission'),
      'Super Admin has all permissions'
    );
    assert.ok(
      auth.hasPermission('admin', 'start_container'),
      'Admin role has start_container permission'
    );
    assert.ok(
      !auth.hasPermission('viewer', 'start_container'),
      'Viewer role does not have start_container permission'
    );
  });

  db.close();
});
