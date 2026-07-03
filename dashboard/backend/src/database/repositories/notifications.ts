// Notifications Repository Subsystem
import { BaseRepository } from './base';
import { Notification, NotificationLevel } from '../../types';

export class NotificationsRepository extends BaseRepository<Notification> {
  findAll(): Notification[] {
    return this.db.all<any>('SELECT * FROM notifications ORDER BY id DESC').map(this._mapRow);
  }

  findLimit(limit: number = 50, unreadOnly: boolean = false): Notification[] {
    let sql = 'SELECT * FROM notifications';
    const params: any[] = [];
    if (unreadOnly) {
      sql += ' WHERE read = 0';
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    return this.db.all<any>(sql, ...params).map(this._mapRow);
  }

  findById(id: string): Notification | undefined {
    const row = this.db.get<any>('SELECT * FROM notifications WHERE id = ?', Number(id));
    return row ? this._mapRow(row) : undefined;
  }

  create(notification: Omit<Notification, 'id' | 'createdAt'>): Notification {
    const res = this.db.run(
      'INSERT INTO notifications (origin, message, level, read) VALUES (?, ?, ?, ?)',
      notification.origin,
      notification.message,
      notification.level || 'info',
      notification.read ? 1 : 0
    );
    const id = Number(res.lastInsertRowid);
    return this.db.all<any>('SELECT * FROM notifications WHERE id = ?', id).map(this._mapRow)[0];
  }

  update(id: string, partial: Partial<Notification>): Notification | undefined {
    const fields = Object.keys(partial).filter((k) => k !== 'id' && k !== 'createdAt');
    if (fields.length === 0) return this.findById(id);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      sets.push(`${key} = ?`);
      let val = (partial as any)[key];
      if (key === 'read') val = val ? 1 : 0;
      values.push(val);
    }

    this.db.run(`UPDATE notifications SET ${sets.join(', ')} WHERE id = ?`, ...values, Number(id));
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM notifications WHERE id = ?', Number(id));
    return res.changes > 0;
  }

  markAllAsRead(): void {
    this.db.run('UPDATE notifications SET read = 1');
  }

  clearAll(): void {
    this.db.run('DELETE FROM notifications');
  }

  private _mapRow(row: any): Notification {
    return {
      id: row.id,
      origin: row.origin,
      message: row.message,
      level: row.level as NotificationLevel,
      read: row.read === 1,
      createdAt: row.created_at
    };
  }
}
