// Alert Notifications Subsystem
import { Logger } from '../utils/logger';
import { AlertEvent } from '../types';

export class Notifier {
  private alertsQueue: AlertEvent[] = [];
  private maxAlerts: number = 20;
  private subscribers: Set<(alert: AlertEvent) => void> = new Set();

  constructor() {
    Logger.info('NotifierSubsystem', 'Structured events notifier queue initialized.');
  }

  // Subscribe websocket client callbacks
  subscribe(callback: (alert: AlertEvent) => void): void {
    this.subscribers.add(callback);
    Logger.debug('NotifierSubsystem', 'Registered client subscriber connection to alerts.');
  }

  unsubscribe(callback: (alert: AlertEvent) => void): void {
    this.subscribers.delete(callback);
    Logger.debug('NotifierSubsystem', 'Removed subscriber connection.');
  }

  // Push new event and broadcast
  notify(origin: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const alert: AlertEvent = { time, origin, message, level };

    this.alertsQueue.unshift(alert);
    if (this.alertsQueue.length > this.maxAlerts) {
      this.alertsQueue.pop();
    }

    // Log internally
    if (level === 'error') {
      Logger.error(origin, message);
    } else if (level === 'warn') {
      Logger.warn(origin, message);
    } else {
      Logger.info(origin, message);
    }

    // Broadcast
    for (const callback of this.subscribers) {
      try {
        callback(alert);
      } catch (err) {
        this.subscribers.delete(callback);
      }
    }
  }

  getHistory(): AlertEvent[] {
    return this.alertsQueue;
  }
}
