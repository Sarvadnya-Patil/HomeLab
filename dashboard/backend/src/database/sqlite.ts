// SQLite database adapter implementation
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DatabaseAdapter } from './adapter';
import { Logger } from '../utils/logger';

export class SqliteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), 'data', 'homelab.db')) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    Logger.info('DatabaseSubsystem', `Initializing SQLite connection at path: ${dbPath}`);
    this.db = new Database(dbPath);

    // Optimize performance defaults
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
  }

  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    try {
      const stmt = this.db.prepare(sql);
      const info = stmt.run(...params);
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid
      };
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `SQL run execution failed: ${err.message} (SQL: ${sql})`);
      throw err;
    }
  }

  get<T>(sql: string, ...params: any[]): T | undefined {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params) as T | undefined;
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `SQL get execution failed: ${err.message} (SQL: ${sql})`);
      throw err;
    }
  }

  all<T>(sql: string, ...params: any[]): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `SQL list execution failed: ${err.message} (SQL: ${sql})`);
      throw err;
    }
  }

  exec(sql: string): void {
    try {
      this.db.exec(sql);
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `SQL raw exec failed: ${err.message}`);
      throw err;
    }
  }

  close(): void {
    try {
      this.db.close();
      Logger.info('DatabaseSubsystem', 'SQLite connection closed successfully.');
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `Failed to close database: ${err.message}`);
    }
  }

  transaction<T>(fn: () => T): T {
    try {
      const txn = this.db.transaction(fn);
      return txn();
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `Transaction execution rolled back: ${err.message}`);
      throw err;
    }
  }
}
