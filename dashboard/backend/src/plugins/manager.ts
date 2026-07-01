// Plugins Discovery and Registry Management Subsystem
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import crypto from 'crypto';
import { Logger } from '../utils/logger';
import { PluginMetadata, ServiceCapability } from '../types';
import { DatabaseAdapter } from '../database/adapter';

export class PluginsManager {
  private db: DatabaseAdapter;
  private servicesDir: string;

  constructor(db: DatabaseAdapter, servicesDir: string = path.join(process.cwd(), '../../services')) {
    this.db = db;
    this.servicesDir = servicesDir;
    Logger.info('PluginsSubsystem', `Plugin discovery registry scanning path: ${servicesDir}`);
  }

  // Scan all service directories recursively for manifests and update SQLite registry
  discover(): PluginMetadata[] {
    const services: PluginMetadata[] = [];
    if (!fs.existsSync(this.servicesDir)) {
      Logger.warn('PluginsSubsystem', `Services directory does not exist: ${this.servicesDir}`);
      return services;
    }

    try {
      const items = fs.readdirSync(this.servicesDir);
      this.db.transaction(() => {
        for (const item of items) {
          const folderPath = path.join(this.servicesDir, item);
          if (!fs.statSync(folderPath).isDirectory()) continue;

          const yamlPath = path.join(folderPath, 'service.yaml');
          if (!fs.existsSync(yamlPath)) continue;

          try {
            const fileContent = fs.readFileSync(yamlPath, 'utf8');
            
            // Compute md5 checksum
            const checksum = crypto.createHash('md5').update(fileContent).digest('hex');
            
            // Check if manifest is already in cache with matching checksum
            const cached = this.db.get<{ checksum: string; manifest: string }>(
              'SELECT checksum, manifest FROM plugin_meta WHERE service_id = ?',
              item
            );

            let parsedManifest: any;
            if (cached && cached.checksum === checksum) {
              parsedManifest = JSON.parse(cached.manifest);
            } else {
              const rawParsed = yaml.parse(fileContent);
              parsedManifest = this._normalizeSchema(rawParsed, item);
              
              if (parsedManifest) {
                // Upsert manifest cache record
                this.db.run(
                  `INSERT INTO plugin_meta (service_id, manifest, checksum, updated_at)
                   VALUES (?, ?, ?, datetime('now'))
                   ON CONFLICT(service_id) DO UPDATE SET
                     manifest = excluded.manifest,
                     checksum = excluded.checksum,
                     updated_at = datetime('now')`,
                  item, JSON.stringify(parsedManifest), checksum
                );
                Logger.info('PluginsSubsystem', `Discovered/updated service manifest: [${item}]`);
              }
            }

            if (parsedManifest) {
              services.push(parsedManifest);
              
              // Automatically ensure service category exists in the database
              this._ensureCategoryExists(parsedManifest.category);
            }
          } catch (err: any) {
            Logger.error('PluginsSubsystem', `Failed to parse YAML manifest in folder [${item}]: ${err.message}`);
          }
        }
      });
    } catch (err: any) {
      Logger.error('PluginsSubsystem', `Discovery scan cycle aborted: ${err.message}`);
    }

    return services;
  }

  // Ensure category exists, scoped to the default 'overview' workspace
  private _ensureCategoryExists(catName: string): void {
    const catId = catName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const existing = this.db.get('SELECT id FROM categories WHERE id = ?', catId);
    if (!existing) {
      // Find highest order
      const maxOrderRow = this.db.get<{ max_order: number }>('SELECT MAX(display_order) as max_order FROM categories');
      const nextOrder = maxOrderRow && maxOrderRow.max_order !== null ? maxOrderRow.max_order + 1 : 0;
      
      this.db.run(
        `INSERT INTO categories (id, workspace_id, name, icon, description, accent, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        catId, 'overview', catName, 'folder', `Auto-created category for ${catName}`, '#8b8b8b', nextOrder
      );
      Logger.info('PluginsSubsystem', `Auto-created dynamic category: [${catName}] (ID: ${catId})`);
    }
  }

  // Helper normalizer mapping versioned schema or fallback legacy
  private _normalizeSchema(data: any, defaultId: string): PluginMetadata | null {
    if (!data) return null;

    const id = data.id || defaultId;
    
    // Default capabilities list if not defined in YAML manifest
    const defaultCapabilities: ServiceCapability[] = ['open', 'start', 'stop', 'restart', 'logs'];
    
    if (data.apiVersion && data.kind === 'Service') {
      const metadata = data.metadata || {};
      const spec = data.spec || {};

      return {
        id: id,
        name: metadata.name || id,
        category: metadata.category || 'Other',
        description: metadata.description || '',
        version: spec.version || 'latest',
        icon: spec.icon || 'default.png',
        enabled: spec.enabled !== undefined ? spec.enabled : true,
        autostart: spec.autostart !== undefined ? spec.autostart : false,
        status: spec.status || 'managed',
        compose: spec.compose || 'docker-compose.yml',
        domain: {
          public: spec.domain || '',
          local: spec.localDomain || ''
        },
        ports: {
          http: spec.port || null
        },
        actions: spec.actions || ['start', 'stop', 'restart', 'logs'],
        capabilities: spec.capabilities || defaultCapabilities,
        permissions: spec.permissions || { adminOnly: false, tunnelExposed: true },
        metrics: spec.metrics || { enabled: false },
        routing: spec.routing || { domain: spec.domain || '' },
        apiVersion: data.apiVersion,
        kind: data.kind
      };
    }

    // Default Fallback mapping
    return {
      id: id,
      name: data.name || id,
      category: data.category || 'Other',
      description: data.description || '',
      version: data.version || 'latest',
      icon: data.icon || 'default.png',
      enabled: data.enabled !== undefined ? data.enabled : true,
      autostart: data.autostart !== undefined ? data.autostart : false,
      status: data.status || 'managed',
      compose: data.compose || 'docker-compose.yml',
      domain: {
        public: data.domain && typeof data.domain === 'object' ? data.domain.public : (data.domain || ''),
        local: data.domain && typeof data.domain === 'object' ? data.domain.local : ''
      },
      ports: {
        http: data.ports && typeof data.ports === 'object' ? data.ports.http : (data.port || null)
      },
      actions: data.actions || ['start', 'stop', 'restart', 'logs'],
      capabilities: data.capabilities || defaultCapabilities,
      permissions: data.permissions || { adminOnly: false, tunnelExposed: true },
      metrics: data.metrics || { enabled: data.port !== undefined, port: data.port, path: '/metrics' },
      routing: data.routing || { domain: (data.domain && typeof data.domain === 'object' ? data.domain.public : data.domain) || '' },
      apiVersion: 'homelab.khulnasoft.com/v1alpha1',
      kind: 'LegacyService'
    };
  }
}
