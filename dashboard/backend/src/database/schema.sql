-- ============================================
-- HomeLab OS Database Schema v5.0 (SQLite DDL)
-- ============================================

-- Enable write-ahead logging and foreign keys
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Users (Authentications & Roles)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',   -- admin | editor | viewer
  avatar      TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 2. Servers (Multi-server clustering)
CREATE TABLE IF NOT EXISTS servers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  hostname          TEXT DEFAULT '',
  ip_address        TEXT DEFAULT '',
  os_name           TEXT DEFAULT '',
  kernel            TEXT DEFAULT '',
  is_local          INTEGER DEFAULT 1,
  docker_proxy_url  TEXT DEFAULT 'http://docker-proxy:2375',
  node_exporter_url TEXT DEFAULT 'http://node-exporter:9100',
  status            TEXT DEFAULT 'unknown',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- 3. Workspaces (Top level dashboard views)
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  name          TEXT NOT NULL,
  icon          TEXT DEFAULT 'grid',
  description   TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  is_default    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 4. Categories (Scoped dynamically per workspace)
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  name          TEXT NOT NULL,
  icon          TEXT DEFAULT 'folder',
  description   TEXT DEFAULT '',
  accent        TEXT DEFAULT '#8b8b8b',
  display_order INTEGER DEFAULT 0,
  collapsed     INTEGER DEFAULT 0,
  visible       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 5. Widgets (Layout positions, dimensions, types, scoped per workspace)
CREATE TABLE IF NOT EXISTS widgets (
  id            TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  type          TEXT NOT NULL,
  title         TEXT DEFAULT '',
  size          TEXT DEFAULT '1x1',
  col           INTEGER DEFAULT 0,
  row           INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  pinned        INTEGER DEFAULT 0,
  visible       INTEGER DEFAULT 1,
  config        TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (id, workspace_id)
);

-- 6. Service Overrides (Overrides service.category category mappings from UI)
CREATE TABLE IF NOT EXISTS service_overrides (
  service_id    TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 7. Service Metadata Cache (Telemetry stats & image version tracking)
CREATE TABLE IF NOT EXISTS service_cache (
  service_id    TEXT PRIMARY KEY,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  container_id  TEXT,
  status        TEXT DEFAULT 'unknown',
  health        TEXT DEFAULT 'unknown',
  cpu_percent   REAL DEFAULT 0.0,
  mem_bytes     INTEGER DEFAULT 0,
  restart_count INTEGER DEFAULT 0,
  image_version TEXT DEFAULT '',
  update_available INTEGER DEFAULT 0,
  last_seen     TEXT DEFAULT (datetime('now'))
);

-- 8. Notifications (Centralized system logs & notifications center)
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  origin      TEXT NOT NULL,
  message     TEXT NOT NULL,
  level       TEXT DEFAULT 'info',
  read        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 9. Settings (Key-value preferences store, supports global or app level groups)
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  group_name  TEXT DEFAULT 'general',
  server_id   TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- 10. Audit Log (Auditing logs for CRUD actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  user_id     TEXT DEFAULT 'system' REFERENCES users(id) ON DELETE SET DEFAULT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     TEXT DEFAULT '{}',
  ip_address  TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 11. Plugin Metadata (Auto-discovered service.yaml YAML manifests cache)
CREATE TABLE IF NOT EXISTS plugin_meta (
  service_id    TEXT PRIMARY KEY,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  manifest      TEXT NOT NULL,             -- JSON string of normalized manifest spec
  checksum      TEXT DEFAULT '',
  discovered_at TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 12. Metrics History (historical telemetry logs)
CREATE TABLE IF NOT EXISTS metrics_history (
  timestamp           TEXT PRIMARY KEY,
  server_id           TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  cpu_percent         REAL,
  ram_percent         REAL,
  disk_percent        REAL,
  gpu_percent         REAL DEFAULT 0.0,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- 13. Jobs (Asynchronous operational logs)
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | failed
  progress      INTEGER DEFAULT 0,
  logs          TEXT DEFAULT '',
  error         TEXT,
  server_id     TEXT DEFAULT 'local' REFERENCES servers(id) ON DELETE SET DEFAULT,
  target_id     TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 14. Workflows (Workflow automation engine definitions)
CREATE TABLE IF NOT EXISTS workflows (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  trigger_type  TEXT NOT NULL,
  trigger_config TEXT NOT NULL, -- JSON config
  actions       TEXT NOT NULL, -- JSON array of actions
  enabled       INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- Optimizing Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_categories_workspace ON categories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_widgets_workspace ON widgets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_level ON notifications(level);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_service_cache_server ON service_cache(server_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_time ON metrics_history(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_server ON jobs(server_id);
