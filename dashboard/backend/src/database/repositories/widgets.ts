// Widgets Repository Subsystem
import { BaseRepository } from './base';
import { Widget, WidgetSize } from '../../types';

export class WidgetsRepository extends BaseRepository<Widget> {
  findAll(): Widget[] {
    return this.db.all<any>('SELECT * FROM widgets ORDER BY display_order ASC').map(this._mapRow);
  }

  findByWorkspace(workspaceId: string): Widget[] {
    return this.db.all<any>('SELECT * FROM widgets WHERE workspace_id = ? ORDER BY display_order ASC', workspaceId).map(this._mapRow);
  }

  // Composite primary key: (id, workspaceId)
  findById(id: string): Widget | undefined {
    // Return first widget that matches id across any workspace if called without workspace context
    const row = this.db.get<any>('SELECT * FROM widgets WHERE id = ?', id);
    return row ? this._mapRow(row) : undefined;
  }

  findByIdAndWorkspace(id: string, workspaceId: string): Widget | undefined {
    const row = this.db.get<any>('SELECT * FROM widgets WHERE id = ? AND workspace_id = ?', id, workspaceId);
    return row ? this._mapRow(row) : undefined;
  }

  create(widget: Omit<Widget, 'createdAt' | 'updatedAt'>): Widget {
    this.db.run(
      `INSERT INTO widgets (id, workspace_id, type, title, size, col, row, display_order, pinned, visible, config) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      widget.id, widget.workspaceId, widget.type, widget.title || '',
      widget.size || '1x1', widget.col || 0, widget.row || 0, widget.displayOrder,
      widget.pinned ? 1 : 0, widget.visible ? 1 : 0,
      JSON.stringify(widget.config || {})
    );
    return this.findByIdAndWorkspace(widget.id, widget.workspaceId)!;
  }

  update(id: string, partial: Partial<Widget>): Widget | undefined {
    // Note: Update by ID assumes updating across active workspaces, but we require updateInWorkspace
    return this.updateInWorkspace(id, partial.workspaceId || 'overview', partial);
  }

  updateInWorkspace(id: string, workspaceId: string, partial: Partial<Widget>): Widget | undefined {
    const fields = Object.keys(partial).filter(k => k !== 'id' && k !== 'workspaceId' && k !== 'createdAt' && k !== 'updatedAt');
    if (fields.length === 0) return this.findByIdAndWorkspace(id, workspaceId);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      let col = key;
      if (key === 'displayOrder') col = 'display_order';
      if (key === 'pinned') col = 'pinned';
      if (key === 'visible') col = 'visible';

      sets.push(`${col} = ?`);
      let val = (partial as any)[key];
      if (key === 'pinned' || key === 'visible') val = val ? 1 : 0;
      if (key === 'config') val = JSON.stringify(val || {});
      values.push(val);
    }

    this.db.run(
      `UPDATE widgets SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?`,
      ...values, id, workspaceId
    );
    return this.findByIdAndWorkspace(id, workspaceId);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM widgets WHERE id = ?', id);
    return res.changes > 0;
  }

  deleteFromWorkspace(id: string, workspaceId: string): boolean {
    const res = this.db.run('DELETE FROM widgets WHERE id = ? AND workspace_id = ?', id, workspaceId);
    return res.changes > 0;
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.run('DELETE FROM widgets WHERE workspace_id = ?', workspaceId);
  }

  saveLayout(workspaceId: string, layouts: Widget[]): void {
    this.db.transaction(() => {
      for (const w of layouts) {
        this.db.run(
          `UPDATE widgets SET size = ?, col = ?, row = ?, display_order = ?, pinned = ?, visible = ?, config = ?, updated_at = datetime('now')
           WHERE id = ? AND workspace_id = ?`,
          w.size, w.col, w.row, w.displayOrder, w.pinned ? 1 : 0, w.visible ? 1 : 0,
          JSON.stringify(w.config || {}), w.id, workspaceId
        );
      }
    });
  }

  private _mapRow(row: any): Widget {
    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(row.config || '{}');
    } catch {
      parsedConfig = {};
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      title: row.title || '',
      size: row.size as WidgetSize,
      col: row.col,
      row: row.row,
      displayOrder: row.display_order,
      pinned: row.pinned === 1,
      visible: row.visible === 1,
      config: parsedConfig,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
