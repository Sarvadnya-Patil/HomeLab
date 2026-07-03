// Master Service Registry Subsystem - Dependency Injection Container
import { EventEmitter } from 'events';
import { DatabaseManager } from '../database';
import { CronScheduler } from '../scheduler/cron';
import { ConfigService } from './services/config.service';
import { DockerService } from './services/docker.service';
import { MetricsService } from './services/metrics.service';
import { NotificationService } from './services/notification.service';
import { WorkspaceService } from './services/workspace.service';
import { CategoryService } from './services/category.service';
import { PluginService } from './services/plugin.service';
import { JobsService } from './services/jobs.service';
import { AuthService } from './services/auth.service';
import { BackupService } from './services/backup.service';
import { WorkflowService } from './services/workflow.service';
import { InfrastructureService } from './services/infrastructure.service';
import { DockerClient } from '../docker/client';
import { Logger } from '../utils/logger';

export class ServiceRegistry {
  private static instance: ServiceRegistry;

  public db!: DatabaseManager;
  public eventBus!: EventEmitter;
  public scheduler!: CronScheduler;
  public config!: ConfigService;
  public docker!: DockerService;
  public metrics!: MetricsService;
  public notification!: NotificationService;
  public workspace!: WorkspaceService;
  public category!: CategoryService;
  public plugin!: PluginService;
  public jobs!: JobsService;
  public auth!: AuthService;
  public backup!: BackupService;
  public workflow!: WorkflowService;
  public infrastructure!: InfrastructureService;

  private constructor() {}

  // 1. Singleton retrieval
  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  // Reset the singleton instance for isolated test contexts
  public static resetInstance(): void {
    ServiceRegistry.instance = undefined as any;
  }

  // 2. Initialize all subsystems and bind dependencies
  public async init(dbPath?: string): Promise<void> {
    Logger.info('ServiceRegistry', 'Initializing HomeLab OS runtime container services...');

    this.db = new DatabaseManager(dbPath);
    this.eventBus = new EventEmitter();
    this.scheduler = new CronScheduler();

    const adapter = this.db.getAdapter();

    const proxyUrl = process.env.DOCKER_PROXY_URL || 'http://docker-proxy:2375';
    const containerProvider = new DockerClient(proxyUrl);

    this.config = new ConfigService(adapter);
    this.docker = new DockerService(containerProvider, adapter);
    this.metrics = new MetricsService(adapter, this.docker);
    this.notification = new NotificationService(adapter, this.eventBus);
    this.workspace = new WorkspaceService(adapter);
    this.category = new CategoryService(adapter);
    this.plugin = new PluginService(adapter, this.category);
    this.jobs = new JobsService(adapter, this.eventBus);
    this.auth = new AuthService(adapter);
    this.backup = new BackupService(adapter, this.jobs);
    this.workflow = new WorkflowService(adapter, this.eventBus, this.jobs);
    this.infrastructure = new InfrastructureService(
      this.db,
      this.docker,
      this.metrics,
      this.scheduler,
      this.plugin,
      this.category
    );

    // Bind automated backup signals from workflow actions
    this.eventBus.on('trigger.backup', () => {
      this.backup.backupDatabase().catch((err) => {
        Logger.error('ServiceRegistry', `Automated backup failed: ${err.message}`);
      });
    });

    Logger.info('ServiceRegistry', 'All runtime container services initialized successfully.');
  }

  // 3. Terminate scheduler intervals on shutdown
  public stop(): void {
    if (this.scheduler) {
      this.scheduler.stopAll();
    }
  }
}
export default ServiceRegistry;
