import { test } from 'node:test';
import assert from 'assert';
import { DatabaseManager } from '../database';
import { UsersRepository } from '../database/repositories/users';

test('Database Subsystem Tests', async (t) => {
  const dbManager = new DatabaseManager(':memory:');
  const adapter = dbManager.getAdapter();

  await t.test('Schema initialization and seeder check', () => {
    // Schema should create workspaces and categories tables and seed defaults
    const workspaces = adapter.all<any>('SELECT * FROM workspaces');
    assert.ok(workspaces.length > 0, 'Seeder must populate workspaces table');

    const categories = adapter.all<any>('SELECT * FROM categories');
    assert.strictEqual(categories.length, 0, 'Categories table should be empty by default');
  });

  await t.test('UsersRepository CRUD queries', () => {
    const repo = new UsersRepository(adapter);

    // Create
    const user = repo.create({
      id: 'test-repo-usr',
      username: 'repouser',
      displayName: 'Repo Tester',
      role: 'editor',
      avatar: 'avatar.png'
    });

    assert.strictEqual(user.id, 'test-repo-usr', 'Created user ID must match input');

    // Read
    const fetched = repo.findById('test-repo-usr');
    assert.ok(fetched, 'Should fetch user from database');
    assert.strictEqual(fetched!.displayName, 'Repo Tester', 'User display name must match');

    // Update
    repo.update('test-repo-usr', { displayName: 'Updated Name' });
    const updated = repo.findById('test-repo-usr');
    assert.strictEqual(updated!.displayName, 'Updated Name', 'Display name update must persist');

    // Delete
    const deleted = repo.delete('test-repo-usr');
    assert.ok(deleted, 'Delete operation should succeed');
    const checked = repo.findById('test-repo-usr');
    assert.strictEqual(checked, undefined, 'Deleted user must not exist');
  });

  dbManager.close();
});
