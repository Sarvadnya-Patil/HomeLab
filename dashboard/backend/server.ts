// Master TypeScript Server Initializer
import path from 'path';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { CoreEngine } from './src/core/engine';
import routes from './src/api/routes';
import { registerSecurityHeaders } from './src/api/security-headers';
import { applyStaticCacheHeaders } from './src/api/static-assets';
import websocket from './src/api/websocket';
import { Logger } from './src/utils/logger';
import { getDatabasePath } from './src/utils/paths';

// X-Forwarded-For is client-controlled unless a proxy we trust overwrites it, so it is ignored
// unless TRUST_PROXY names those proxies: "true", a hop count (e.g. "1"), or a comma-separated
// list of IPs/CIDRs (e.g. "172.18.0.0/16"). Per-IP rate limits depend on this being right.
function parseTrustProxy(value: string | undefined): boolean | string[] | ((address: string, hop: number) => boolean) {
  const raw = (value || '').trim();
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) {
    // Trust the first N proxies in front of the server
    const hops = Number(raw);
    return (_address: string, hop: number) => hop < hops;
  }
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const fastify = Fastify({ logger: { level: 'error' }, trustProxy: parseTrustProxy(process.env.TRUST_PROXY) });

// Security headers must be registered before the static plugin so they cover the frontend files too
registerSecurityHeaders(fastify);

// Register fastify websocket plugin
fastify.register(websocketPlugin);

import fs from 'fs';

// Dynamically locate frontend static assets
let frontendDir = path.join(__dirname, '../frontend');
if (!fs.existsSync(frontendDir)) {
  frontendDir = path.join(__dirname, 'frontend');
}
if (!fs.existsSync(frontendDir)) {
  frontendDir = path.join(process.cwd(), 'frontend');
}
if (!fs.existsSync(frontendDir)) {
  frontendDir = path.join(process.cwd(), 'dashboard', 'frontend');
}

Logger.info('ServerBoot', `Serving static frontend files from: ${frontendDir}`);

// Serve static frontend files with live freshness headers to prevent stale browser caching
fastify.register(staticPlugin, {
  root: frontendDir,
  prefix: '/',
  setHeaders: applyStaticCacheHeaders
});

const engine = new CoreEngine(fastify);

// Mount versioned REST and socket gateways
fastify.register(async (instance) => {
  routes(instance, engine);
  websocket(instance, engine);
});

const PORT = Number(process.env.BACKEND_PORT) || Number(process.env.PORT) || 8081;
const start = async () => {
  try {
    await engine.init(getDatabasePath());
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`HomeLab Modular Control Plane (TS Engine) listening on port ${PORT}`);
  } catch (err: any) {
    Logger.error('ServerBoot', `Boot crash: ${err.message}`);
    process.exit(1);
  }
};

start();
