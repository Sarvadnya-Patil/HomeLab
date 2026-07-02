// Database Seeder Subsystem
import { DatabaseAdapter } from './adapter';
import { Logger } from '../utils/logger';
import crypto from 'crypto';

export function seedDatabase(db: DatabaseAdapter): void {
  // Check if seeder was already run
  const check = db.get<{ count: number }>('SELECT COUNT(*) as count FROM workspaces');
  if (check && check.count > 0) {
    Logger.debug('DatabaseSubsystem', 'Database is already seeded. Skipping seeder.');
    return;
  }

  Logger.info('DatabaseSubsystem', 'Database is empty. Executing initial seeder hooks...');

  db.transaction(() => {
    // 1. Insert default admin user
    const adminPass = crypto.scryptSync('admin', 'salt123', 64).toString('hex');
    db.run(
      `INSERT INTO users (id, username, password, display_name, role) VALUES (?, ?, ?, ?, ?)`,
      'admin', 'admin', adminPass, 'Administrator', 'admin'
    );

    // 2. Insert default local server
    db.run(
      `INSERT INTO servers (id, name, is_local, status) VALUES (?, ?, ?, ?)`,
      'local', 'Local Server', 1, 'online'
    );

    // 3. Insert default workspaces
    const workspaces = [
      { id: 'overview', name: 'Overview', icon: 'layout', description: 'Core homelab systems layout dashboard', display_order: 0, is_default: 1 },
      { id: 'infrastructure', name: 'Infrastructure', icon: 'server', description: 'Discovered services status logs', display_order: 1, is_default: 0 },
      { id: 'monitoring', name: 'Monitoring', icon: 'activity', description: 'Hardware load visualizers', display_order: 2, is_default: 0 },
      { id: 'ai', name: 'AI Stack', icon: 'sparkles', description: 'Local models and GPU metrics', display_order: 3, is_default: 0 },
      { id: 'networking', name: 'Networking', icon: 'globe', description: 'Ingress tunnels and DNS rules', display_order: 4, is_default: 0 },
      { id: 'storage', name: 'Storage', icon: 'database', description: 'ZFS pools and directory volumes', display_order: 5, is_default: 0 }
    ];

    for (const ws of workspaces) {
      db.run(
        `INSERT INTO workspaces (id, name, icon, description, display_order, is_default) VALUES (?, ?, ?, ?, ?, ?)`,
        ws.id, ws.name, ws.icon, ws.description, ws.display_order, ws.is_default
      );
    }

    // 4. Insert default categories for 'overview' workspace
    const categories = [
      { id: 'infrastructure', workspace_id: 'overview', name: 'Infrastructure', icon: 'server', description: 'Discovered services', accent: '#3b82f6', display_order: 0 },
      { id: 'monitoring', workspace_id: 'overview', name: 'Monitoring', icon: 'activity', description: 'Monitoring tools', accent: '#10b981', display_order: 1 },
      { id: 'automation', workspace_id: 'overview', name: 'Automation', icon: 'zap', description: 'Workflow automation', accent: '#a855f7', display_order: 2 },
      { id: 'ai', workspace_id: 'overview', name: 'AI Stack', icon: 'sparkles', description: 'Model orchestrators', accent: '#f59e0b', display_order: 3 },
      { id: 'networking', workspace_id: 'overview', name: 'Networking', icon: 'globe', description: 'Routing targets', accent: '#06b6d4', display_order: 4 },
      { id: 'storage', workspace_id: 'overview', name: 'Storage', icon: 'database', description: 'Disk services', accent: '#eab308', display_order: 5 }
    ];

    for (const cat of categories) {
      db.run(
        `INSERT INTO categories (id, workspace_id, name, icon, description, accent, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        cat.id, cat.workspace_id, cat.name, cat.icon, cat.description, cat.accent, cat.display_order
      );
    }

    // 5. Insert default widgets layout for 'overview' workspace
    const widgets = [
      { id: 'w-cpu', workspace_id: 'overview', type: 'cpu', title: 'CPU Usage', size: '1x1', display_order: 0, pinned: 1 },
      { id: 'w-ram', workspace_id: 'overview', type: 'ram', title: 'RAM Allocation', size: '1x1', display_order: 1, pinned: 1 },
      { id: 'w-gpu', workspace_id: 'overview', type: 'gpu', title: 'GPU Details', size: '1x1', display_order: 2, pinned: 0 },
      { id: 'w-disk', workspace_id: 'overview', type: 'disk', title: 'Disk Pool', size: '1x1', display_order: 3, pinned: 1 },
      { id: 'w-services', workspace_id: 'overview', type: 'services', title: 'Services Matrix', size: 'full', display_order: 4, pinned: 1 },
      { id: 'w-terminal', workspace_id: 'overview', type: 'terminal', title: 'Local Console', size: '2x1', display_order: 5, pinned: 1 },
      { id: 'w-ingress', workspace_id: 'overview', type: 'ingress', title: 'Ingress Map', size: '2x1', display_order: 6, pinned: 1 },
      { id: 'w-events', workspace_id: 'overview', type: 'events', title: 'System Event Feed', size: 'full', display_order: 7, pinned: 1 }
    ];

    for (const w of widgets) {
      db.run(
        `INSERT INTO widgets (id, workspace_id, type, title, size, display_order, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        w.id, w.workspace_id, w.type, w.title, w.size, w.display_order, w.pinned
      );
    }

    // 6. Insert default settings
    const settings = [
      { key: 'app.name', value: 'HomeLab OS', group_name: 'general' },
      { key: 'docker.proxy_url', value: 'http://docker-proxy:2375', group_name: 'docker' },
      { key: 'metrics.interval', value: '3000', group_name: 'metrics' },
      { key: 'ui.sidebar_width', value: '220', group_name: 'appearance' }
    ];

    for (const s of settings) {
      db.run(
        `INSERT INTO settings (key, value, group_name) VALUES (?, ?, ?)`,
        s.key, s.value, s.group_name
      );
    }
  });

  Logger.info('DatabaseSubsystem', 'Database seeder completed successfully.');
}
