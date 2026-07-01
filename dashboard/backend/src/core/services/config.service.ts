// Config service subsystem wrapping preferences database repository
import { DatabaseAdapter } from '../../database/adapter';
import { SettingsRepository } from '../../database/repositories/settings';

export class ConfigService {
  private repo: SettingsRepository;

  constructor(db: DatabaseAdapter) {
    this.repo = new SettingsRepository(db);
  }

  // 1. Retrieve a setting key value
  get(key: string): string | null {
    return this.repo.get(key) || null;
  }

  // 2. Set a setting key value
  set(key: string, value: string, groupName?: string): void {
    this.repo.set(key, value, groupName);
  }

  // 3. Find all settings records
  getAll(): any[] {
    return this.repo.findAll();
  }
}
export default ConfigService;
