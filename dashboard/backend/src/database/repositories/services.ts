// Services overrides and cache repository
import { DatabaseAdapter } from '../adapter';
import { ServiceStatus } from '../../types';

export interface ServiceOverride {
  serviceId: string;
  categoryId: string;
  serverId: string;
}

export interface CachedServiceStats {
  serviceId: string;
  serverId: string;
  containerId: string | null;
  status: ServiceStatus;
  health: string;
  cpuPercent: number | null;
  memBytes: number | null;
  restartCount: number;
  imageVersion: string;
  updateAvailable: boolean;
  lastSeen: string;
}

export class ServicesRepository {
  constructor(private db: DatabaseAdapter) {}

  // 1. Service category overrides CRUD
  getOverrides(): Record<string, string> {
    const rows = this.db.all<any>('SELECT service_id, category_id FROM service_overrides');
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.service_id] = r.category_id;
    }
    return map;
  }

  saveOverride(serviceId: string, categoryId: string, serverId: string = 'local'): void {
    this.db.run(
      `INSERT INTO service_overrides (service_id, category_id, server_id, updated_at) 
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(service_id) DO UPDATE SET category_id = excluded.category_id, server_id = excluded.server_id, updated_at = datetime('now')`,
      serviceId,
      categoryId,
      serverId
    );
  }

  deleteOverride(serviceId: string): boolean {
    const res = this.db.run('DELETE FROM service_overrides WHERE service_id = ?', serviceId);
    return res.changes > 0;
  }

  // 2. Service metadata caching (Telemetry & Image tags)
  getCachedStats(serviceId: string, serverId: string = 'local'): CachedServiceStats | undefined {
    const row = this.db.get<any>(
      'SELECT * FROM service_cache WHERE service_id = ? AND server_id = ?',
      serviceId,
      serverId
    );
    return row ? this._mapCacheRow(row) : undefined;
  }

  getAllCachedStats(serverId: string = 'local'): CachedServiceStats[] {
    return this.db
      .all<any>('SELECT * FROM service_cache WHERE server_id = ?', serverId)
      .map(this._mapCacheRow);
  }

  saveCachedStats(stats: Omit<CachedServiceStats, 'lastSeen'>): void {
    this.db.run(
      `INSERT INTO service_cache (service_id, server_id, container_id, status, health, cpu_percent, mem_bytes, restart_count, image_version, update_available, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(service_id) DO UPDATE SET 
         container_id = excluded.container_id,
         status = excluded.status,
         health = excluded.health,
         cpu_percent = excluded.cpu_percent,
         mem_bytes = excluded.mem_bytes,
         restart_count = excluded.restart_count,
         image_version = excluded.image_version,
         update_available = excluded.update_available,
         last_seen = datetime('now')`,
      stats.serviceId,
      stats.serverId,
      stats.containerId,
      stats.status,
      stats.health,
      stats.cpuPercent,
      stats.memBytes,
      stats.restartCount,
      stats.imageVersion,
      stats.updateAvailable ? 1 : 0
    );
  }

  private _mapCacheRow(row: any): CachedServiceStats {
    return {
      serviceId: row.service_id,
      serverId: row.server_id,
      containerId: row.container_id,
      status: row.status as ServiceStatus,
      health: row.health,
      cpuPercent: row.cpu_percent,
      memBytes: row.mem_bytes,
      restartCount: row.restart_count,
      imageVersion: row.image_version || '',
      updateAvailable: row.update_available === 1,
      lastSeen: row.last_seen
    };
  }
}
