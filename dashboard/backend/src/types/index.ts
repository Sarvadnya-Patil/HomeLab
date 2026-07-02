// HomeLab OS Core Subsystem Type Definitions
import { 
  ServiceStatus, 
  NotificationLevel, 
  WidgetSize, 
  UserRole, 
  ServerStatus,
  ServiceCapability 
} from './enums';

export * from './enums';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatar: string;
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  osName: string;
  kernel: string;
  isLocal: boolean;
  dockerProxyUrl: string;
  nodeExporterUrl: string;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  description: string;
  displayOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  icon: string;
  description: string;
  accent: string;
  displayOrder: number;
  collapsed: boolean;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Widget {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  size: WidgetSize;
  col: number;
  row: number;
  displayOrder: number;
  pinned: boolean;
  visible: boolean;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// Unified PluginMetadata (acts as both manifest & enriched representation for compatibility)
export interface PluginMetadata {
  id: string;
  name: string;
  category: string;
  description: string;
  version: string;
  icon: string;
  enabled: boolean;
  autostart: boolean;
  status: string;
  compose: string;
  ports: {
    http: number | null;
    [key: string]: number | null;
  };
  domain: {
    public: string;
    local: string;
  };
  actions: string[];
  capabilities?: ServiceCapability[];
  permissions: {
    adminOnly: boolean;
    tunnelExposed: boolean;
  };
  metrics: {
    enabled: boolean;
    port?: number;
    path?: string;
  };
  routing: {
    domain: string;
    sslVerify?: boolean;
  };
  apiVersion: string;
  kind: string;
  containerId?: string;
  details?: {
    port: string | number;
    latency: string;
    uptime: string;
    lastCheck: string;
  };
}

export interface PluginManifest extends PluginMetadata {}
export interface EnrichedService extends PluginMetadata {}

export interface SystemMetrics {
  hostname: string;
  kernel: string;
  osName: string;
  ipAddress: string;
  cpuModel: string;
  cpuCores: number;
  cpu: number | null;
  cpuTemp: number | null;
  cpuFreq: string | null;
  ram: number | null;
  ramGbUsed: string | null;
  ramGbTotal: string | null;
  gpu: number | null;
  gpuTemp: number | null;
  disk: number | null;
  diskGbUsed: number | null;
  diskGbTotal: number | null;
  uptime: string;
  loadAvg?: number[];
  dockerVersion: string | null;
  dockerStatus: string;
  containerCount: number;
  runningContainers: number;
  stoppedContainers: number;
}

export interface Notification {
  id: number;
  origin: string;
  message: string;
  level: NotificationLevel;
  read: boolean;
  createdAt: string;
}

export interface AlertEvent {
  time: string;
  origin: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface AuditEntry {
  id: number;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, any>;
  ipAddress: string;
  createdAt: string;
}

export interface SearchResult {
  type: 'service' | 'category' | 'workspace' | 'widget' | 'command' | 'setting';
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  action: string;
}

export interface DockerContainer {
  Id: string;
  Names: string[];
  State: string;
  Status: string;
}

// Dynamic configuration schemas
export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'toggle' | 'select' | 'array';
  required: boolean;
  default?: any;
  options?: string[]; // For select type
  description?: string;
}

export interface ConfigSchema {
  serviceId: string;
  fields: FormField[];
}

// Service templates configuration
export interface ServiceTemplate {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
}

export type SystemStats = SystemMetrics;

export interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  error?: string;
  serverId?: string;
  targetId?: string;
  createdAt?: string;
  updatedAt?: string;
}
