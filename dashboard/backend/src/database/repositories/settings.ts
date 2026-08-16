// Settings Repository Subsystem
import { DatabaseAdapter } from '../adapter';
import { Logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export interface SettingItem {
  key: string;
  value: string;
  groupName: string;
  updatedAt: string;
}

const PERSISTENT_KEYS = [
  'ssh.host', 'ssh.port', 'ssh.username', 'ssh.password', 'ssh.key',
  'security.2fa.enabled', 'smtp.host', 'smtp.port', 'smtp.username', 'smtp.password', 'smtp.from'
];

const PERSIST_FILE = '/data/persistent_settings.json';

export class SettingsRepository {
  constructor(private db: DatabaseAdapter) {
    this.restorePersistentSettings();
  }

  private restorePersistentSettings(): void {
    try {
      if (fs.existsSync(PERSIST_FILE)) {
        const data = fs.readFileSync(PERSIST_FILE, 'utf-8');
        const settings = JSON.parse(data);
        for (const [key, details] of Object.entries<any>(settings)) {
          if (PERSISTENT_KEYS.includes(key)) {
            this.db.run(
              `INSERT INTO settings (key, value, group_name, updated_at) 
               VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, group_name = excluded.group_name, updated_at = datetime('now')`,
              key,
              details.value,
              details.groupName
            );
          }
        }
        Logger.info('SettingsRepository', `Successfully restored ${Object.keys(settings).length} persistent config keys from ${PERSIST_FILE}`);
      }
    } catch (err: any) {
      Logger.error('SettingsRepository', `Failed to restore persistent settings: ${err.message}`);
    }
  }

  private savePersistentSetting(key: string, value: string, groupName: string): void {
    if (!PERSISTENT_KEYS.includes(key)) return;
    try {
      let settings: Record<string, { value: string; groupName: string }> = {};
      if (fs.existsSync(PERSIST_FILE)) {
        const data = fs.readFileSync(PERSIST_FILE, 'utf-8');
        settings = JSON.parse(data);
      }
      settings[key] = { value, groupName };
      
      const dir = path.dirname(PERSIST_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err: any) {
      Logger.error('SettingsRepository', `Failed to persist key ${key} to ${PERSIST_FILE}: ${err.message}`);
    }
  }

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
    this.savePersistentSetting(key, value, groupName);
  }

  delete(key: string): boolean {
    const res = this.db.run('DELETE FROM settings WHERE key = ?', key);
    if (res.changes > 0) {
      try {
        if (fs.existsSync(PERSIST_FILE)) {
          const data = fs.readFileSync(PERSIST_FILE, 'utf-8');
          const settings = JSON.parse(data);
          if (settings[key]) {
            delete settings[key];
            fs.writeFileSync(PERSIST_FILE, JSON.stringify(settings, null, 2), 'utf-8');
          }
        }
      } catch {}
    }
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
