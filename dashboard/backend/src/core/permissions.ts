// Role-based access control: the single source of truth for who may call which API route.
//
// Roles form a strict ladder, viewer < editor < admin. Every /api/v1 route is matched against the
// policy table below by longest path prefix. A route that matches no rule requires admin, so a
// newly added endpoint is locked down until someone deliberately opens it up here.

import { UserRole } from '../types/enums';

export type Role = UserRole;

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

interface AccessRule {
  /** Path prefix, matched on whole path segments. */
  prefix: string;
  /** Minimum role for GET and HEAD requests. */
  read: Role;
  /** Minimum role for every other method. */
  write: Role;
}

const POLICY: AccessRule[] = [
  // Host-level and configuration surfaces.
  { prefix: '/api/v1/terminal', read: 'admin', write: 'admin' },
  { prefix: '/api/v1/backups', read: 'admin', write: 'admin' },
  { prefix: '/api/v1/settings', read: 'admin', write: 'admin' },
  { prefix: '/api/v1/audit', read: 'admin', write: 'admin' },

  // Container lifecycle, topology and background jobs.
  { prefix: '/api/v1/docker', read: 'editor', write: 'editor' },
  { prefix: '/api/v1/designer', read: 'editor', write: 'editor' },
  { prefix: '/api/v1/jobs', read: 'editor', write: 'editor' },

  // Cluster membership is visible to everyone but only admins change it.
  { prefix: '/api/v1/servers', read: 'viewer', write: 'admin' },

  // Actions every signed-in user may take on their own session.
  { prefix: '/api/v1/auth/me', read: 'viewer', write: 'viewer' },
  { prefix: '/api/v1/auth/password', read: 'viewer', write: 'viewer' },
  { prefix: '/api/v1/auth/logout', read: 'viewer', write: 'viewer' },
  { prefix: '/api/v1/auth/ws-ticket', read: 'viewer', write: 'viewer' },

  // Read-only dashboards for viewers; changes need at least editor.
  { prefix: '/api/v1/metrics', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/workspaces', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/notifications', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/categories', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/services', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/plugins', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/search', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/health', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/system', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/apps', read: 'viewer', write: 'editor' },
  { prefix: '/api/v1/docs', read: 'viewer', write: 'editor' }
];

const FALLBACK_RULE: Pick<AccessRule, 'read' | 'write'> = { read: 'admin', write: 'admin' };

// Longest prefix first so a specific rule such as /auth/me is never shadowed by a broader one.
const ORDERED_POLICY = [...POLICY].sort((a, b) => b.prefix.length - a.prefix.length);

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLE_RANK, value);
}

/** True when `actual` is a known role at or above `required`. Unknown roles rank below everything. */
export function roleAtLeast(actual: unknown, required: Role): boolean {
  return isRole(actual) && ROLE_RANK[actual] >= ROLE_RANK[required];
}

/** The minimum role needed to perform `method` on `url` (query string ignored). */
export function requiredRole(method: string, url: string): Role {
  const path = url.split('?')[0];
  const rule = ORDERED_POLICY.find((r) => matchesPrefix(path, r.prefix)) || FALLBACK_RULE;
  const verb = method.toUpperCase();
  return verb === 'GET' || verb === 'HEAD' ? rule.read : rule.write;
}

export function authorize(role: unknown, method: string, url: string): { allowed: boolean; required: Role } {
  const required = requiredRole(method, url);
  return { allowed: roleAtLeast(role, required), required };
}
