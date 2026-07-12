// Servers Repository Subsystem
import { BaseRepository } from './base';
import { Server } from '../../types';

export class ServersRepository extends BaseRepository<Server> {
  findAll(): Server[] {
    return this.db
      .all<any>('SELECT * FROM servers ORDER BY is_local DESC, name ASC')
      .map(this._mapRow);
  }

  findById(id: string): Server | undefined {
    const row = this.db.get<any>('SELECT * FROM servers WHERE id = ?', id);
    return row ? this._mapRow(row) : undefined;
  }

  create(server: Omit<Server, 'createdAt' | 'updatedAt'>): Server {
    this.db.run(
      `INSERT INTO servers (id, name, hostname, ip_address, os_name, kernel, is_local, docker_proxy_url, node_exporter_url, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      server.id,
      server.name,
      server.hostname,
      server.ipAddress,
      server.osName,
      server.kernel,
      server.isLocal ? 1 : 0,
      server.dockerProxyUrl,
      server.nodeExporterUrl,
      server.status
    );
    return this.findById(server.id)!;
  }

  update(id: string, partial: Partial<Server>): Server | undefined {
    const allowed = ['name', 'hostname', 'ipAddress', 'osName', 'kernel', 'isLocal', 'dockerProxyUrl', 'nodeExporterUrl', 'status'];
    const fields = Object.keys(partial).filter(
      (k) => allowed.includes(k)
    );
    if (fields.length === 0) return this.findById(id);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      let col = key;
      if (key === 'ipAddress') col = 'ip_address';
      if (key === 'osName') col = 'os_name';
      if (key === 'isLocal') col = 'is_local';
      if (key === 'dockerProxyUrl') col = 'docker_proxy_url';
      if (key === 'nodeExporterUrl') col = 'node_exporter_url';

      sets.push(`${col} = ?`);
      let val = (partial as any)[key];
      if (key === 'isLocal') val = val ? 1 : 0;
      values.push(val);
    }

    this.db.run(
      `UPDATE servers SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values,
      id
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM servers WHERE id = ?', id);
    return res.changes > 0;
  }

  private _mapRow(row: any): Server {
    return {
      id: row.id,
      name: row.name,
      hostname: row.hostname || '',
      ipAddress: row.ip_address || '',
      osName: row.os_name || '',
      kernel: row.kernel || '',
      isLocal: row.is_local === 1,
      dockerProxyUrl: row.docker_proxy_url || '',
      nodeExporterUrl: row.node_exporter_url || '',
      status: row.status || 'unknown',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
