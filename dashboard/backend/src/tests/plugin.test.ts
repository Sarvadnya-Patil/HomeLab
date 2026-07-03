import { test } from 'node:test';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../database';
import { CategoryService } from '../core/services/category.service';
import { PluginService } from '../core/services/plugin.service';

test('Plugin Discovery Subsystem Tests', async (t) => {
  const db = new DatabaseManager(':memory:');
  const adapter = db.getAdapter();
  const categorySvc = new CategoryService(adapter);

  // Setup mock service directory on disk
  const testServicesDir = path.join(process.cwd(), 'data', 'test-services');
  const mockPluginDir = path.join(testServicesDir, 'mock-plugin');
  if (!fs.existsSync(mockPluginDir)) {
    fs.mkdirSync(mockPluginDir, { recursive: true });
  }

  const mockYaml = `
apiVersion: homelab.khulnasoft.com/v1alpha1
kind: Service
metadata:
  name: Mock Plugin
  category: Testing
spec:
  version: 1.0.0
`;
  fs.writeFileSync(path.join(mockPluginDir, 'service.yaml'), mockYaml, 'utf8');

  // Initialize service targeting mock services directory
  const pluginSvc = new PluginService(adapter, categorySvc, testServicesDir);

  await t.test('Plugin manifests cache DB persistence', () => {
    const cached = pluginSvc.discover();
    assert.ok(cached.length > 0, 'Plugins list should return cached items');

    const target = cached.find((p) => p.id === 'mock-plugin');
    assert.ok(target, 'Target plugin must exist in list');
    assert.strictEqual(target!.name, 'Mock Plugin', 'Plugin name must match mock manifest');

    // Check database record
    const dbRecord = adapter.get<{ manifest: string }>(
      'SELECT manifest FROM plugin_meta WHERE service_id = ?',
      'mock-plugin'
    );
    assert.ok(dbRecord, 'Plugin metadata must be cached in SQLite db');
    const parsed = JSON.parse(dbRecord.manifest);
    assert.strictEqual(parsed.name, 'Mock Plugin', 'Cached metadata name must match');
  });

  // Clean up
  try {
    fs.rmSync(testServicesDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  db.close();
});
