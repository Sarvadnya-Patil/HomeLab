import { test } from 'node:test';
import assert from 'assert';
import { ServiceRegistry } from '../core/registry';

test('Service Registry Subsystem Tests', async (t) => {
  const registry = ServiceRegistry.getInstance();

  await t.test('Registry singleton initialization', async () => {
    // Override environment for test socket target validation bypass
    process.env.DOCKER_PROXY_URL = 'http://127.0.0.1:2375';

    await registry.init();

    assert.ok(registry.db, 'Database Manager must be registered');
    assert.ok(registry.eventBus, 'Event Bus emitter must be registered');
    assert.ok(registry.config, 'Config service must be registered');
    assert.ok(registry.jobs, 'Jobs service must be registered');
    assert.ok(registry.auth, 'Authentication service must be registered');
    assert.ok(registry.backup, 'Backup engine must be registered');
    assert.ok(registry.workflow, 'Workflow engine must be registered');
  });

  registry.stop();
});
