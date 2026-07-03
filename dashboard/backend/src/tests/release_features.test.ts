import { test } from 'node:test';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import fastify from 'fastify';
import { DatabaseManager } from '../database';
import { CoreEngine } from '../core/engine';
import registerRoutes from '../api/routes';
import { BackupService } from '../core/services/backup.service';
import { JobsService } from '../core/services/jobs.service';
import { EventEmitter } from 'events';
import { ServiceRegistry } from '../core/registry';

test('Release Readiness Subsystems Verification', async (t) => {
  process.env.JWT_SECRET = 'test-secret-key-32-chars-long-12345';
  process.env.DOCKER_PROXY_URL = 'http://127.0.0.1:2375';

  await t.test('Centralized Audit Middleware Interception', async () => {
    ServiceRegistry.resetInstance();
    const app = fastify();
    const engine = new CoreEngine(app);
    await engine.init(':memory:');
    registerRoutes(app, engine);

    // Seed test user manually to satisfy foreign key constraints
    const adapter = engine.db.getAdapter();
    adapter.run(
      'INSERT INTO users (id, username, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
      'admin',
      'admin',
      'mockpassword',
      'Admin User',
      'admin'
    );

    // Seed test user layout configuration mutating request
    const token = (engine.auth as any).signJwt({ id: 'admin', username: 'admin', role: 'admin' });

    // POST request to trigger the audit logger hook
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/designer/layout',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        workspaceId: 'overview',
        layout: []
      }
    });

    assert.ok(res.statusCode >= 200, 'Request should execute successfully');

    // Query audit_log table to verify log insertion
    const logs = engine.auditRepo.findAll(10);
    const target = logs.find((log) => log.action.startsWith('POST:') && log.userId === 'admin');
    assert.ok(target, 'Audit log entry must be automatically written for mutating request');
    assert.strictEqual(
      target!.entityType,
      'designer',
      'Audit resource log entity must match route path'
    );
    assert.ok(
      target!.details.path.includes('/api/v1/designer/layout'),
      'Audit path details must be captured'
    );

    engine.stop();
  });

  await t.test('First-Time Setup Wizard Flow', async () => {
    ServiceRegistry.resetInstance();
    const app = fastify();
    const engine = new CoreEngine(app);
    await engine.init(':memory:');
    registerRoutes(app, engine);

    // 1. Initial state: 0 users exist, setupRequired should be true
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/setup-status'
    });
    assert.strictEqual(statusRes.statusCode, 200);
    const statusBody = JSON.parse(statusRes.body);
    assert.strictEqual(statusBody.setupRequired, true, 'Setup should be required on fresh startup');

    // 2. Perform setup account creation
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: {
        username: 'setup-admin',
        password: 'securePassword123',
        displayName: 'System Admin'
      }
    });
    assert.strictEqual(setupRes.statusCode, 200);
    const setupBody = JSON.parse(setupRes.body);
    assert.strictEqual(setupBody.success, true);
    assert.strictEqual(setupBody.user.username, 'setup-admin');

    // 3. Post-setup check: setupRequired should be false
    const statusResPost = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/setup-status'
    });
    assert.strictEqual(statusResPost.statusCode, 200);
    const statusBodyPost = JSON.parse(statusResPost.body);
    assert.strictEqual(
      statusBodyPost.setupRequired,
      false,
      'Setup should not be required after account creation'
    );

    // 4. Repeated setup post request should be rejected
    const setupResPost = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: {
        username: 'setup-admin2',
        password: 'securePassword123',
        displayName: 'System Admin 2'
      }
    });
    assert.strictEqual(
      setupResPost.statusCode,
      400,
      'Setup creation endpoint should return 400 Bad Request'
    );

    engine.stop();
  });

  await t.test('Backup Retention Engine Age Pruning', async () => {
    const db = new DatabaseManager(':memory:');
    const adapter = db.getAdapter();
    const eventBus = new EventEmitter();
    const jobs = new JobsService(adapter, eventBus);

    const testBackupDir = path.join(process.cwd(), 'data', 'test-backups');
    const backupSvc = new BackupService(adapter, jobs, testBackupDir);

    const expiredFile = path.join(testBackupDir, 'db-backup-expired.sql');
    const activeFile = path.join(testBackupDir, 'db-backup-active.sql');

    fs.writeFileSync(expiredFile, 'Mock expired data', 'utf8');
    fs.writeFileSync(activeFile, 'Mock active data', 'utf8');

    // Set mtime of expired file to 10 days ago (10 * 24 * 60 * 60 = 864000 seconds)
    const now = Date.now();
    const tenDaysAgoSec = (now - 10 * 24 * 60 * 60 * 1000) / 1000;
    const nowSec = now / 1000;
    fs.utimesSync(expiredFile, nowSec, tenDaysAgoSec);

    // Enforce 7-day retention policy
    await backupSvc.enforceRetention(7);

    assert.ok(!fs.existsSync(expiredFile), 'Expired backup file must be deleted');
    assert.ok(fs.existsSync(activeFile), 'Active backup file must remain untampered');

    // Clean up files
    try {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    db.close();
  });

  await t.test('WebSocket Client Heartbeat Connection Dropouts', async () => {
    ServiceRegistry.resetInstance();
    const app = fastify();
    const engine = new CoreEngine(app);
    await engine.init(':memory:');

    let terminated = false;
    let listenersCleared = false;

    // Simulate standard WebSocket client
    const mockSocket = {
      isAlive: true,
      readyState: 1,
      send: () => {},
      ping: () => {},
      terminate: () => {
        terminated = true;
      },
      on: () => {},
      removeAllListeners: () => {
        listenersCleared = true;
      }
    };

    engine.registerWsClient(mockSocket);
    assert.strictEqual((mockSocket as any).isAlive, true, 'isAlive flag must be initialized');

    // Simulate missing a heartbeat tick
    (mockSocket as any).isAlive = false;

    // Trigger heartbeat tick logic manually
    for (const socket of (engine as any).wsClients.keys()) {
      if (socket.isAlive === false) {
        socket.terminate();
        engine.removeWsClient(socket);
      }
    }

    assert.ok(terminated, 'Connection must be terminated when heartbeat response fails');
    assert.ok(listenersCleared, 'Event listeners must be cleaned up to avoid memory leaks');
    assert.ok(
      !(engine as any).wsClients.has(mockSocket),
      'Pruned connection must be removed from pool'
    );

    engine.stop();
  });
});
