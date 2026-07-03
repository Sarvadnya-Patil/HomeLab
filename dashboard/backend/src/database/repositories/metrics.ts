// Metrics performance statistics history repository
import { DatabaseAdapter } from '../adapter';

export interface MetricsRecord {
  timestamp: string;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  gpuPercent: number;
}

export class MetricsRepository {
  constructor(private db: DatabaseAdapter) {}

  // 1. Save performance metrics snapshot
  save(record: Omit<MetricsRecord, 'timestamp'>): void {
    this.db.run(
      `INSERT INTO metrics_history (timestamp, cpu_percent, ram_percent, disk_percent, gpu_percent, created_at)
       VALUES (datetime('now'), ?, ?, ?, ?, datetime('now'))`,
      record.cpuPercent,
      record.ramPercent,
      record.diskPercent,
      record.gpuPercent
    );
  }

  // 2. Fetch history records list in chronological order
  getHistory(limit: number = 60): MetricsRecord[] {
    const rows = this.db.all<any>(
      `SELECT timestamp, cpu_percent, ram_percent, disk_percent, gpu_percent FROM metrics_history
       ORDER BY timestamp DESC LIMIT ?`,
      limit
    );
    return rows
      .map((r) => ({
        timestamp: r.timestamp,
        cpuPercent: r.cpu_percent,
        ramPercent: r.ram_percent,
        diskPercent: r.disk_percent,
        gpuPercent: r.gpu_percent
      }))
      .reverse();
  }

  // 3. Prune old telemetry lines past retention window (hours)
  prune(retentionHours: number): void {
    this.db.run(
      `DELETE FROM metrics_history WHERE created_at < datetime('now', '-' || ? || ' hour')`,
      retentionHours
    );
  }
}
