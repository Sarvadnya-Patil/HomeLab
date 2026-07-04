// Categories Repository Subsystem
import { BaseRepository } from './base';
import { Category } from '../../types';

export class CategoriesRepository extends BaseRepository<Category> {
  findAll(): Category[] {
    return this.db
      .all<any>('SELECT * FROM categories ORDER BY display_order ASC, name ASC')
      .map(this._mapRow);
  }

  findByWorkspace(workspaceId: string): Category[] {
    return this.db
      .all<any>(
        'SELECT * FROM categories WHERE workspace_id = ? ORDER BY display_order ASC, name ASC',
        workspaceId
      )
      .map(this._mapRow);
  }

  findById(id: string): Category | undefined {
    const row = this.db.get<any>('SELECT * FROM categories WHERE id = ?', id);
    return row ? this._mapRow(row) : undefined;
  }

  create(category: Omit<Category, 'createdAt' | 'updatedAt'>): Category {
    this.db.run(
      `INSERT INTO categories (id, workspace_id, name, icon, description, accent, display_order, collapsed, visible) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      category.id,
      category.workspaceId,
      category.name,
      category.icon || 'folder',
      category.description || '',
      category.accent || '#8b8b8b',
      category.displayOrder,
      category.collapsed ? 1 : 0,
      category.visible ? 1 : 0
    );
    return this.findById(category.id)!;
  }

  update(id: string, partial: Partial<Category>): Category | undefined {
    if (!this.findById(id)) {
      this.create({
        id,
        workspaceId: partial.workspaceId || 'overview',
        name: partial.name || (id.charAt(0).toUpperCase() + id.slice(1)),
        icon: partial.icon || 'server',
        description: partial.description || 'Auto-discovered services',
        accent: partial.accent || '#8b8b8b',
        displayOrder: partial.displayOrder !== undefined ? partial.displayOrder : 10,
        collapsed: partial.collapsed || false,
        visible: partial.visible || true
      });
    }

    const fields = Object.keys(partial).filter(
      (k) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt'
    );
    if (fields.length === 0) return this.findById(id);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      let col = key;
      if (key === 'workspaceId') col = 'workspace_id';
      if (key === 'displayOrder') col = 'display_order';
      if (key === 'collapsed') col = 'collapsed';
      if (key === 'visible') col = 'visible';

      sets.push(`${col} = ?`);
      let val = (partial as any)[key];
      if (key === 'collapsed' || key === 'visible') val = val ? 1 : 0;
      values.push(val);
    }

    this.db.run(
      `UPDATE categories SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values,
      id
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM categories WHERE id = ?', id);
    return res.changes > 0;
  }

  reorder(orders: { id: string; displayOrder: number }[]): void {
    this.db.transaction(() => {
      for (const item of orders) {
        this.db.run(
          'UPDATE categories SET display_order = ?, updated_at = datetime("now") WHERE id = ?',
          item.displayOrder,
          item.id
        );
      }
    });
  }

  private _mapRow(row: any): Category {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      icon: row.icon || 'folder',
      description: row.description || '',
      accent: row.accent || '#8b8b8b',
      displayOrder: row.display_order,
      collapsed: row.collapsed === 1,
      visible: row.visible === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
