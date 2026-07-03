// Notification service wrapper subsystem writing alerts and triggering bus streams
import { EventEmitter } from 'events';
import { DatabaseAdapter } from '../../database/adapter';
import { NotificationsRepository } from '../../database/repositories/notifications';
import { Notifier } from '../../notifications/notifier';
import { AlertEvent } from '../../types';

export class NotificationService {
  private notifier: Notifier;
  private repo: NotificationsRepository;

  constructor(
    db: DatabaseAdapter,
    private eventBus: EventEmitter
  ) {
    this.repo = new NotificationsRepository(db);
    this.notifier = new Notifier();
  }

  // 1. Build structured alert, save to SQLite, and stream event payload
  notify(
    serviceId: string,
    message: string,
    level: 'info' | 'warn' | 'error' | 'success' = 'info'
  ): void {
    // Map success level to info for the notifier proxy which expects standard types
    const mappedLevel = level === 'success' ? 'info' : level;
    this.notifier.notify(serviceId, message, mappedLevel);

    const created = this.repo.create({
      origin: serviceId,
      message,
      level: mappedLevel,
      read: false
    });

    this.eventBus.emit('alert', {
      time: created.createdAt || new Date().toISOString(),
      origin: created.origin,
      message: created.message,
      level: created.level as 'info' | 'warn' | 'error'
    } as AlertEvent);
  }

  // 2. Fetch history records list mapped to AlertEvent interface
  getHistory(limit: number = 50, unreadOnly: boolean = false): AlertEvent[] {
    const rows = this.repo.findLimit(limit, unreadOnly);
    return rows.map((r) => ({
      time: r.createdAt || new Date().toISOString(),
      origin: r.origin,
      message: r.message,
      level: (r.level === 'success' ? 'info' : r.level) as 'info' | 'warn' | 'error'
    }));
  }

  // 3. Mark notification as read
  markRead(id: number): any {
    return this.repo.update(String(id), { read: true });
  }

  // 4. Wipe read logs
  clearAll(): void {
    this.repo.clearAll();
  }
}
export default NotificationService;
