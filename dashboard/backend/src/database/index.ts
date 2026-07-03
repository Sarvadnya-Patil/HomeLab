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
