// Settings Repository Subsystem
import { DatabaseAdapter } from '../adapter';
import { Logger } from '../../utils/logger';

export interface SettingItem {
  key: string;
  value: string;
  groupName: string;
  updatedAt: string;
}

export class SettingsRepository {
  constructor(private db: DatabaseAdapter) {}

  findAll(): SettingItem[] {
    return this.db.all<any>('SELECT * FROM settings ORDER BY key ASC').map(this._mapRow);
  }

  findByGroup(groupName: string): SettingItem[] {
    return this.db
      .all<any>('SELECT * FROM settings WHERE group_name = ? ORDER BY key ASC', groupName)
      .map(this._mapRow);
  }

  get(key: string): string | undefined {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : undefined;
  }

  set(key: string, value: string, groupName: string = 'general'): void {
    this.db.run(
      `INSERT INTO settings (key, value, group_name, updated_at) 
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, group_name = excluded.group_name, updated_at = datetime('now')`,
      key,
      value,
      groupName
    );
    Logger.debug('SettingsRepository', `Settings key updated: ${key} -> ${value}`);
  }

  delete(key: string): boolean {
    const res = this.db.run('DELETE FROM settings WHERE key = ?', key);
    return res.changes > 0;
  }

  private _mapRow(row: any): SettingItem {
    return {
      key: row.key,
      value: row.value,
      groupName: row.group_name || 'general',
      updatedAt: row.updated_at
    };
  }
}
