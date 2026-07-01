// HomeLab OS core architecture enums

export type ServiceStatus = 'active' | 'inactive' | 'pending' | 'not_installed' | 'unknown' | 'error';
export type NotificationLevel = 'success' | 'info' | 'warn' | 'error';
export type WidgetSize = '1x1' | '2x1' | '2x2' | 'full';
export type UserRole = 'admin' | 'editor' | 'viewer';
export type ServerStatus = 'online' | 'offline' | 'degraded' | 'unknown';

export type ServiceCapability = 
  | 'open'
  | 'start'
  | 'stop'
  | 'logs' 
  | 'shell' 
  | 'restart' 
  | 'update' 
  | 'metrics' 
  | 'terminal' 
  | 'backup' 
  | 'restore' 
  | 'exec' 
  | 'files';
