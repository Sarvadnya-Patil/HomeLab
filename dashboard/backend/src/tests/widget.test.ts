import { test } from 'node:test';
import assert from 'assert';
import { DatabaseManager } from '../database';
import { WorkspaceService } from '../core/services/workspace.service';

test('Workspace & Widget Subsystem Tests', async (t) => {
  const db = new DatabaseManager(':memory:');
  const workspaceSvc = new WorkspaceService(db.getAdapter());

  await t.test('Workspace layouts and widget configurations retrieval', () => {
    // Seeder seeds workspaces automatically. Ensure default is seeded.
    const workspaces = workspaceSvc.getWorkspaces();
    assert.ok(workspaces.length > 0, 'Should load seeded workspaces');

    const overview = workspaces.find((w) => w.id === 'overview');
    assert.ok(overview, 'Overview workspace should be seeded');
    assert.strictEqual(
      overview!.isDefault,
      true,
      'Overview must be marked as the default workspace'
    );
  });

  db.close();
});
