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

  private constructor() {}

  // 1. Singleton retrieval
  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  // 2. Initialize all subsystems and bind dependencies
  public async init(): Promise<void> {
    Logger.info('ServiceRegistry', 'Initializing HomeLab OS runtime container services...');

    this.db = new DatabaseManager();
    this.eventBus = new EventEmitter();
    this.scheduler = new CronScheduler();

    const adapter = this.db.getAdapter();

    this.config = new ConfigService(adapter);
    this.docker = new DockerService(adapter);
    this.metrics = new MetricsService(adapter, this.docker);
    this.notification = new NotificationService(adapter, this.eventBus);
    this.workspace = new WorkspaceService(adapter);
    this.category = new CategoryService(adapter);
    this.plugin = new PluginService(adapter, this.category);

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
