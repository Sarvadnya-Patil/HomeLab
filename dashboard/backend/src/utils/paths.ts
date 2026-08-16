import path from 'path';

/**
 * Resolves the root data directory.
 * Configurable via DATA_DIR env variable. Defaults to the 'data' directory in the process working directory.
 */
export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Resolves the SQLite database file path.
 * Configurable via DATABASE_PATH or DB_PATH env variables. Defaults to 'homelab.db' within the data directory.
 */
export function getDatabasePath(): string {
  return process.env.DATABASE_PATH || process.env.DB_PATH || path.join(getDataDir(), 'homelab.db');
}

/**
 * Resolves the compose cache JSON file path.
 * Configurable via COMPOSE_CACHE_PATH env variable. Defaults to 'compose_cache.json' within the data directory.
 */
export function getComposeCachePath(): string {
  return process.env.COMPOSE_CACHE_PATH || path.join(getDataDir(), 'compose_cache.json');
}

/**
 * Resolves the plugins/services root directory.
 * Configurable via SERVICES_DIR env variable. Defaults to '../../services' relative to the process working directory.
 */
export function getServicesDir(): string {
  return process.env.SERVICES_DIR || path.join(process.cwd(), '../../services');
}
