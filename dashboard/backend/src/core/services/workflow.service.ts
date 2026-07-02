// Workflow Automation Engine Service Subsystem
import { EventEmitter } from 'events';
import { DatabaseAdapter } from '../../database/adapter';
import { Logger } from '../../utils/logger';
import { JobsService } from './jobs.service';

export interface WorkflowRule {
  id: string;
  name: string;
  triggerType: 'metrics' | 'event' | 'schedule';
  triggerConfig: any;
  actions: any[];
  enabled: boolean;
}

export class WorkflowService {
  private rules: WorkflowRule[] = [];

  constructor(
    private db: DatabaseAdapter,
    private eventBus: EventEmitter,
    private jobs: JobsService
  ) {
    this.loadRulesFromDb();
    this.registerEventTriggers();
  }

  // 1. Load active workflows from SQLite database
  private loadRulesFromDb(): void {
    try {
      const rows = this.db.all<any>('SELECT * FROM workflows');
      this.rules = rows.map(r => ({
        id: r.id,
        name: r.name,
        triggerType: r.trigger_type as any,
        triggerConfig: JSON.parse(r.trigger_config),
        actions: JSON.parse(r.actions),
        enabled: r.enabled === 1
      }));
      Logger.info('WorkflowEngine', `Loaded ${this.rules.length} operational automation workflows.`);
    } catch (err: any) {
      Logger.error('WorkflowEngine', `Failed to load rules: ${err.message}`);
    }
  }

  // 2. Wire event bus listeners for automation triggers
  private registerEventTriggers(): void {
    // Listen to container action triggers
    this.eventBus.on('docker.container.updated', (event: any) => {
      this.evaluateRules('event', { eventName: 'container_updated', ...event });
    });

    // Listen to notification alerts
    this.eventBus.on('notification.created', (event: any) => {
      this.evaluateRules('event', { eventName: 'notification_created', ...event });
    });

    // Listen to metrics updates (e.g. CPU loads)
    this.eventBus.on('system.metrics', (metrics: any) => {
      this.evaluateRules('metrics', metrics);
    });
  }

  // 3. Evaluate active workflows against incoming metrics or events
  private async evaluateRules(type: 'metrics' | 'event' | 'schedule', data: any): Promise<void> {
    const active = this.rules.filter(r => r.enabled && r.triggerType === type);

    for (const rule of active) {
      let triggered = false;

      if (type === 'metrics') {
        const threshold = rule.triggerConfig.threshold || 90;
        const metricName = rule.triggerConfig.metric || 'cpu';
        
        if (metricName === 'cpu' && data.cpuPercent > threshold) triggered = true;
        if (metricName === 'ram' && data.ramPercent > threshold) triggered = true;
      } else if (type === 'event') {
        const expectedEvent = rule.triggerConfig.eventName;
        if (data.eventName === expectedEvent) triggered = true;
      }

      if (triggered) {
        Logger.info('WorkflowEngine', `Workflow [${rule.name}] triggered. Running automation actions...`);
        this.executeActions(rule.actions);
      }
    }
  }

  // 4. Dispatch actions list
  private async executeActions(actions: any[]): Promise<void> {
    for (const act of actions) {
      try {
        if (act.type === 'notification') {
          // Channel integration email / discord / telegram webhook mock
          Logger.info('WorkflowEngine', `[Action: Notification] Dispatching webhook message: "${act.config.message}" to: ${act.config.channel}`);
          this.eventBus.emit('alert', {
            origin: 'Automation',
            message: `[${act.config.channel.toUpperCase()}] ${act.config.message}`,
            level: 'warning'
          });
        } else if (act.type === 'container_action') {
          Logger.info('WorkflowEngine', `[Action: Container] Triggering container action: [${act.config.action}] on: ${act.config.serviceId}`);
          
          await this.jobs.executeAsyncTask(
            `container_${act.config.action}`,
            act.config.serviceId,
            async (updateProgress) => {
              updateProgress(50, 'Executing automation container override...');
              updateProgress(100, 'Automation job completed.');
            }
          );
        } else if (act.type === 'backup') {
          Logger.info('WorkflowEngine', '[Action: Backup] Triggering automated database backup copy...');
          // Trigger DB backup
          this.eventBus.emit('trigger.backup');
        }
      } catch (err: any) {
        Logger.error('WorkflowEngine', `Action dispatch failure: ${err.message}`);
      }
    }
  }

  // 5. REST API rules overrides CRUD
  createRule(rule: Omit<WorkflowRule, 'id'>): WorkflowRule {
    const newRule = { ...rule, id: `w-${Date.now()}` };
    this.db.run(
      `INSERT INTO workflows (id, name, trigger_type, trigger_config, actions, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newRule.id, newRule.name, newRule.triggerType,
      JSON.stringify(newRule.triggerConfig), JSON.stringify(newRule.actions),
      newRule.enabled ? 1 : 0
    );
    this.loadRulesFromDb();
    return newRule;
  }

  deleteRule(id: string): boolean {
    const res = this.db.run('DELETE FROM workflows WHERE id = ?', id);
    this.loadRulesFromDb();
    return res.changes > 0;
  }

  getRules(): WorkflowRule[] {
    return this.rules;
  }
}
export default WorkflowService;
