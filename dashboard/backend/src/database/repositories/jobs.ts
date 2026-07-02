// Jobs persistence repository subsystem
import { BaseRepository } from './base';
import { Job } from '../../types';

export class JobsRepository extends BaseRepository<Job> {
  // 1. Retrieve all jobs ordered by creation date
  findAll(limit: number = 50): Job[] {
    return this.db.all<any>(
      'SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?',
      limit
    ).map(this._mapRow);
  }

  // 2. Query single job by primary key ID
  findById(id: string): Job | undefined {
    const row = this.db.get<any>('SELECT * FROM jobs WHERE id = ?', id);
    return row ? this._mapRow(row) : undefined;
  }

  // 3. Create a new job record
  create(job: Omit<Job, 'createdAt' | 'updatedAt'>): Job {
    this.db.run(
      `INSERT INTO jobs (id, type, status, progress, error, server_id, target_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      job.id, job.type, job.status, job.progress, job.error || null,
      job.serverId || 'local', job.targetId || null
    );
    return this.findById(job.id)!;
  }

  // 4. Update partial job states
  update(id: string, partial: Partial<Job>): Job | undefined {
    const fields = Object.keys(partial).filter(k => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt');
    if (fields.length === 0) return this.findById(id);

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of fields) {
      let col = key;
      if (key === 'targetId') col = 'target_id';
      if (key === 'serverId') col = 'server_id';

      sets.push(`${col} = ?`);
      values.push((partial as any)[key]);
    }

    this.db.run(
      `UPDATE jobs SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...values, id
    );
    return this.findById(id);
  }

  // 5. Delete a job record
  delete(id: string): boolean {
    const res = this.db.run('DELETE FROM jobs WHERE id = ?', id);
    return res.changes > 0;
  }

  // 6. Map SQLite row to Job schema
  private _mapRow(row: any): Job {
    return {
      id: row.id,
      type: row.type,
      status: row.status as any,
      progress: row.progress,
      error: row.error || undefined,
      serverId: row.server_id,
      targetId: row.target_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
export default JobsRepository;
