// Users Repository Subsystem
import { BaseRepository } from './base';
import { User } from '../../types';

export class UsersRepository extends BaseRepository<User> {
  findAll(): User[] {
    return this.db.all<User>(
      'SELECT id, username, display_name AS displayName, role, avatar, created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY username ASC'
    );
  }

  findById(id: string): User | undefined {
    return this.db.get<User>(
      'SELECT id, username, password, display_name AS displayName, role, avatar, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?',
      id
    );
  }

  findByUsername(username: string): User | undefined {
    return this.db.get<User>(
      'SELECT id, username, password, display_name AS displayName, role, avatar, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE username = ?',
      username
    );
  }

  create(user: Omit<User, 'createdAt' | 'updatedAt'>): User {
    this.db.run(
      'INSERT INTO users (id, username, password, display_name, role, avatar) VALUES (?, ?, ?, ?, ?, ?)',
      user.id,
      user.username,
      user.password || '',
      user.displayName,
      user.role,
      user.avatar
    );
    return this.findById(user.id)!;
  }

  update(id: string, partial: Partial<User>): User | undefined {
    const allowed = ['username', 'password', 'displayName', 'role', 'avatar'];
    const fields = Object.keys(partial).filter(
      (k) => allowed.includes(k)
    );
    if (fields.length === 0) return this.findById(id);

    const sets = fields.map((f) => {
      const colName = f === 'displayName' ? 'display_name' : f;
      return `${colName} = ?`;
    });
    const values = fields.map((f) => (partial as any)[f]);

    this.db.run(
      `UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values,
      id
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM users WHERE id = ?', id);
    return res.changes > 0;
  }
}
