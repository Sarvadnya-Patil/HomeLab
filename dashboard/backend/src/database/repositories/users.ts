// Users Repository Subsystem
import { BaseRepository } from './base';
import { User } from '../../types';

export class UsersRepository extends BaseRepository<User> {
  findAll(): User[] {
    return this.db.all<User>('SELECT * FROM users ORDER BY username ASC');
  }

  findById(id: string): User | undefined {
    return this.db.get<User>('SELECT * FROM users WHERE id = ?', id);
  }

  create(user: Omit<User, 'createdAt' | 'updatedAt'>): User {
    this.db.run(
      'INSERT INTO users (id, username, display_name, role, avatar) VALUES (?, ?, ?, ?, ?)',
      user.id, user.username, user.displayName, user.role, user.avatar
    );
    return this.findById(user.id)!;
  }

  update(id: string, partial: Partial<User>): User | undefined {
    const fields = Object.keys(partial).filter(k => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt');
    if (fields.length === 0) return this.findById(id);

    const sets = fields.map(f => {
      // Map camelCase to snake_case for SQLite compatibility if needed, but our columns match camelCase in schema exactly
      const colName = f === 'displayName' ? 'display_name' : f;
      return `${colName} = ?`;
    });
    const values = fields.map(f => (partial as any)[f]);

    this.db.run(
      `UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values, id
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM users WHERE id = ?', id);
    return res.changes > 0;
  }
}
