// Workspaces Repository Subsystem
import { BaseRepository } from './base';
import { Workspace } from '../../types';

export class WorkspacesRepository extends BaseRepository<Workspace> {
  findAll(): Workspace[] {
    return this.db.all<any>('SELECT * FROM workspaces ORDER BY display_order ASC, name ASC').map(this._mapRow);
  }

  findById(id: string): Workspace | undefined {
    const row = this.db.get<any>('SELECT * FROM workspaces WHERE id = ?', id);
    return row ? this._mapRow(row) : undefined;
  }

  create(workspace: Omit<Workspace, 'createdAt' | 'updatedAt'>): Workspace {
    this.db.run(
      'INSERT INTO workspaces (id, name, icon, description, display_order, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      workspace.id, workspace.name, workspace.icon, workspace.description || '',
      workspace.displayOrder, workspace.isDefault ? 1 : 0
    );
    return this.findById(workspace.id)!;
  }

  update(id: string, partial: Partial<Workspace>): Workspace | undefined {
    const fields = Object.keys(partial).filter(k => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt');
    if (fields.length === 0) return this.findById(id);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      let col = key;
      if (key === 'displayOrder') col = 'display_order';
      if (key === 'isDefault') col = 'is_default';

      sets.push(`${col} = ?`);
      let val = (partial as any)[key];
      if (key === 'isDefault') val = val ? 1 : 0;
      values.push(val);
    }

    this.db.run(
      `UPDATE workspaces SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values, id
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM workspaces WHERE id = ?', id);
    return res.changes > 0;
  }

  reorder(orders: { id: string; displayOrder: number }[]): void {
    this.db.transaction(() => {
      for (const item of orders) {
        this.db.run('UPDATE workspaces SET display_order = ?, updated_at = datetime("now") WHERE id = ?', item.displayOrder, item.id);
      }
    });
  }

  private _mapRow(row: any): Workspace {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon || 'grid',
      description: row.description || '',
      displayOrder: row.display_order,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
