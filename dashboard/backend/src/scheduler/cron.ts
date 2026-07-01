// Background Job Scheduler Subsystem
import { Logger } from '../utils/logger';

interface ScheduledJob {
  name: string;
  timerId: NodeJS.Timeout;
}

export class CronScheduler {
  private jobs: ScheduledJob[] = [];

  constructor() {
    Logger.info('SchedulerSubsystem', 'Cron job scheduler daemon active.');
  }

  // Bind interval task
  schedule(name: string, intervalMs: number, taskFn: () => Promise<void> | void): void {
    this.cancel(name);
    
    Logger.debug('SchedulerSubsystem', `Scheduling background job [${name}] every ${intervalMs}ms`);

    const timerId = setInterval(async () => {
      try {
        await taskFn();
      } catch (err: any) {
        Logger.error('SchedulerSubsystem', `Scheduler job [${name}] execution error: ${err.message}`);
      }
    }, intervalMs);

    this.jobs.push({ name, timerId });
  }

  // Cancel registered interval
  cancel(name: string): void {
    const idx = this.jobs.findIndex(j => j.name === name);
    if (idx !== -1) {
      clearInterval(this.jobs[idx].timerId);
      this.jobs.splice(idx, 1);
    }
  }

  stopAll(): void {
    for (const job of this.jobs) {
      clearInterval(job.timerId);
    }
    this.jobs = [];
    Logger.info('SchedulerSubsystem', 'All scheduled intervals cancelled.');
  }
}
