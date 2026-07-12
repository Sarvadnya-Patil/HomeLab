// Asynchronous Job Execution Engine Service
import { EventEmitter } from 'events';
import { DatabaseAdapter } from '../../database/adapter';
import { JobsRepository } from '../../database/repositories/jobs';
import { Job } from '../../types';
import { Logger } from '../../utils/logger';
import { randomUUID } from 'crypto';

export class JobsService {
  private repo: JobsRepository;

  constructor(
    db: DatabaseAdapter,
    private eventBus: EventEmitter
  ) {
    this.repo = new JobsRepository(db);
  }

  // 1. Create a new persistent job
  createJob(type: string, targetId?: string, serverId: string = 'local'): Job {
    const job: Omit<Job, 'createdAt' | 'updatedAt'> = {
      id: randomUUID(),
      type,
      status: 'pending',
      progress: 0,
      logs: 'Job queued.',
      serverId,
      targetId
    };
    const created = this.repo.create(job);
    this.eventBus.emit('job.updated', created);
    Logger.debug('JobEngine', `Job [${created.id}] created: type=${type}, target=${targetId}`);
    return created;
  }

  // 2. Update job properties and emit event updates
  updateJob(
    id: string,
    partial: Partial<Omit<Job, 'id' | 'createdAt' | 'updatedAt'>>
  ): Job | undefined {
    const updated = this.repo.update(id, partial);
    if (updated) {
      this.eventBus.emit('job.updated', updated);
    }
    return updated;
  }

  // 3. Fetch jobs logs
  getJobs(limit: number = 50): Job[] {
    return this.repo.findAll(limit);
  }

  // 4. Retrieve single job
  getJob(id: string): Job | undefined {
    return this.repo.findById(id);
  }

  // 5. Run a background promise-based job task asynchronously with live progress logging
  async executeAsyncTask(
    type: string,
    targetId: string | undefined,
    taskFn: (updateProgress: (prog: number, logMsg?: string) => void) => Promise<void>,
    serverId: string = 'local'
  ): Promise<Job> {
    const job = this.createJob(type, targetId, serverId);
    this.updateJob(job.id, {
      status: 'running',
      progress: 5,
      logs: '[SYSTEM] Job execution started.'
    });

    // Execute task in background thread
    (async () => {
      try {
        await taskFn((prog: number, logMsg?: string) => {
          const current = this.getJob(job.id);
          if (current?.status === 'failed' && current?.error === 'Job was manually cancelled by operator.') {
            throw new Error('JobCancelled');
          }
          let logs = current?.logs || '';
          if (logMsg) {
            logs = logs ? `${logs}\n[INFO] ${logMsg}` : `[INFO] ${logMsg}`;
          }
          this.updateJob(job.id, { progress: Math.min(Math.max(prog, 5), 95), logs });
        });
        const finalJob = this.getJob(job.id);
        if (finalJob?.status === 'failed' && finalJob?.error === 'Job was manually cancelled by operator.') {
          return;
        }
        const finalLogs = `${finalJob?.logs || ''}\n[SUCCESS] Job execution finished.`;
        this.updateJob(job.id, { status: 'success', progress: 100, logs: finalLogs });
      } catch (err: any) {
        if (err.message === 'JobCancelled') {
          return;
        }
        Logger.error('JobEngine', `Job [${job.id}] execution failed: ${err.message}`);
        const finalJob = this.getJob(job.id);
        if (finalJob?.status === 'failed' && finalJob?.error === 'Job was manually cancelled by operator.') {
          return;
        }
        const finalLogs = `${finalJob?.logs || ''}\n[ERROR] ${err.message}`;
        this.updateJob(job.id, { status: 'failed', error: err.message, logs: finalLogs });
      }
    })();

    return job;
  }
}
export default JobsService;
