// Database Manager orchestrator
import path from 'path';
import fs from 'fs';
import { SqliteAdapter } from './sqlite';
import { seedDatabase } from './seed';
import { Logger } from '../utils/logger';

export class DatabaseManager {
  private adapter: SqliteAdapter;

  constructor(dbPath?: string) {
    this.adapter = new SqliteAdapter(dbPath);
    this.initSchema();
  }

  private initSchema() {
    try {
      // Find DDL schema path dynamically depending on compiled output layout
      let schemaPath = path.join(__dirname, 'schema.sql');
      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
      }

      if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(process.cwd(), 'dist', 'src', 'database', 'schema.sql');
      }

      Logger.info('DatabaseSubsystem', `Executing DDL schema initialization from: ${schemaPath}`);
      const ddl = fs.readFileSync(schemaPath, 'utf8');
      this.adapter.exec(ddl);

      // Perform auto-migrations for existing sqlite database files
      const migrations = [
        "ALTER TABLE categories ADD COLUMN server_id TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT",
        "ALTER TABLE categories ADD COLUMN collapsed INTEGER DEFAULT 0",
        "ALTER TABLE categories ADD COLUMN visible INTEGER DEFAULT 1",
        "ALTER TABLE widgets ADD COLUMN server_id TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT",
        "ALTER TABLE widgets ADD COLUMN pinned INTEGER DEFAULT 0",
        "ALTER TABLE widgets ADD COLUMN visible INTEGER DEFAULT 1"
      ];
      for (const sql of migrations) {
        try {
          this.adapter.exec(sql);
        } catch {
          // Column already exists — expected on existing databases, silently ignored
        }
      }



      // Seed default system models
      seedDatabase(this.adapter);
    } catch (err: any) {
      Logger.error('DatabaseSubsystem', `Failed to bootstrap database schema: ${err.message}`);
      throw err;
    }
  }

  getAdapter(): SqliteAdapter {
    return this.adapter;
  }

  close(): void {
    this.adapter.close();
  }
}
export { Category, WidgetLayout, DashboardLayout } from './db';
