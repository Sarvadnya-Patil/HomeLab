// JSON-based database persistence engine
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger';

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
  accent: string;
  order: number;
  collapsed: boolean;
  visible: boolean;
}

export interface WidgetLayout {
  id: string;
  size: '1x1' | '2x1' | '2x2' | 'full';
  order: number;
  pinned: boolean;
  visible: boolean;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: WidgetLayout[];
}

export class JsonDatabase {
  private dataDir: string;
  private categoriesPath: string;
  private dashboardsPath: string;
  private overridesPath: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.categoriesPath = path.join(this.dataDir, 'categories.json');
    this.dashboardsPath = path.join(this.dataDir, 'dashboards.json');
    this.overridesPath = path.join(this.dataDir, 'overrides.json');

    this._ensureDir();
    Logger.info('DatabaseSubsystem', `JSON storage active in path: ${this.dataDir}`);
  }

  private _ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Categories persistence
  getCategories(): Category[] {
    if (!fs.existsSync(this.categoriesPath)) {
      const defaultCategories = this._getDefaultCategories();
      this.saveCategories(defaultCategories);
      return defaultCategories;
    }
    try {
      return JSON.parse(fs.readFileSync(this.categoriesPath, 'utf8'));
    } catch {
      return this._getDefaultCategories();
    }
  }

  saveCategories(categories: Category[]): void {
    fs.writeFileSync(this.categoriesPath, JSON.stringify(categories, null, 2), 'utf8');
    Logger.info('DatabaseSubsystem', 'Updated categories catalog persisted.');
  }

  // Dashboards persistence
  getDashboards(): DashboardLayout[] {
    if (!fs.existsSync(this.dashboardsPath)) {
      const defaultDashboards = this._getDefaultDashboards();
      this.saveDashboards(defaultDashboards);
      return defaultDashboards;
    }
    try {
      return JSON.parse(fs.readFileSync(this.dashboardsPath, 'utf8'));
    } catch {
      return this._getDefaultDashboards();
    }
  }

  saveDashboards(dashboards: DashboardLayout[]): void {
    fs.writeFileSync(this.dashboardsPath, JSON.stringify(dashboards, null, 2), 'utf8');
    Logger.info('DatabaseSubsystem', 'Updated dashboard layouts persisted.');
  }

  // Service overrides persistence (overriding service category from UI)
  getOverrides(): Record<string, string> {
    if (!fs.existsSync(this.overridesPath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.overridesPath, 'utf8'));
    } catch {
      return {};
    }
  }

  saveOverrides(overrides: Record<string, string>): void {
    fs.writeFileSync(this.overridesPath, JSON.stringify(overrides, null, 2), 'utf8');
    Logger.info('DatabaseSubsystem', 'Updated service category overrides persisted.');
  }

  private _getDefaultCategories(): Category[] {
    return [
      { id: 'infrastructure', name: 'Infrastructure', icon: 'infrastructure', description: 'Core host cluster assets', accent: '#3b82f6', order: 0, collapsed: false, visible: true },
      { id: 'monitoring', name: 'Monitoring', icon: 'monitoring', description: 'Host health logs and metrics scraper tools', accent: '#10b981', order: 1, collapsed: false, visible: true },
      { id: 'automation', name: 'Automation', icon: 'automation', description: 'Self-hosted workflow tools', accent: '#a855f7', order: 2, collapsed: false, visible: true },
      { id: 'ai', name: 'AI Stack', icon: 'ai', description: 'Local LLMs and AI interfaces', accent: '#f59e0b', order: 3, collapsed: false, visible: true },
      { id: 'networking', name: 'Networking', icon: 'networking', description: 'Routing and connection components', accent: '#06b6d4', order: 4, collapsed: false, visible: true },
      { id: 'storage', name: 'Storage', icon: 'storage', description: 'File systems and object storage databases', accent: '#eab308', order: 5, collapsed: false, visible: true }
    ];
  }

  private _getDefaultDashboards(): DashboardLayout[] {
    return [
      {
        id: 'overview',
        name: 'Overview',
        widgets: [
          { id: 'cpu', size: '1x1', order: 0, pinned: true, visible: true },
          { id: 'ram', size: '1x1', order: 1, pinned: true, visible: true },
          { id: 'gpu', size: '1x1', order: 2, pinned: false, visible: true },
          { id: 'disk', size: '1x1', order: 3, pinned: true, visible: true },
          { id: 'services', size: 'full', order: 4, pinned: true, visible: true },
          { id: 'terminal', size: '2x1', order: 5, pinned: true, visible: true },
          { id: 'ingress', size: '2x1', order: 6, pinned: true, visible: true },
          { id: 'events', size: 'full', order: 7, pinned: true, visible: true }
        ]
      },
      {
        id: 'monitoring',
        name: 'Monitoring',
        widgets: [
          { id: 'cpu', size: '2x1', order: 0, pinned: true, visible: true },
          { id: 'ram', size: '2x1', order: 1, pinned: true, visible: true },
          { id: 'disk', size: '2x1', order: 2, pinned: true, visible: true },
          { id: 'events', size: 'full', order: 3, pinned: true, visible: true }
        ]
      }
    ];
  }
}
