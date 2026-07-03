// Audit Log Repository Subsystem
import { DatabaseAdapter } from '../adapter';
import { AuditEntry } from '../../types';

export class AuditRepository {
  constructor(private db: DatabaseAdapter) {}

  findAll(limit: number = 100): AuditEntry[] {
    return this.db
      .all<any>('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit)
      .map(this._mapRow);
  }

  log(
    userId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, any> = {},
    ipAddress: string = ''
  ): AuditEntry {
    const res = this.db.run(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      ipAddress
    );
    const id = Number(res.lastInsertRowid);
    return this.db.all<any>('SELECT * FROM audit_log WHERE id = ?', id).map(this._mapRow)[0];
  }

  private _mapRow(row: any): AuditEntry {
    let parsedDetails = {};
    try {
      parsedDetails = JSON.parse(row.details || '{}');
    } catch {
      parsedDetails = {};
    }

    return {
      id: row.id,
      userId: row.user_id || 'system',
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id || '',
      details: parsedDetails,
      ipAddress: row.ip_address || '',
      createdAt: row.created_at
    };
  }
}
