// Master TypeScript Server Initializer
import path from 'path';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { CoreEngine } from './src/core/engine';
import routes from './src/api/routes';
import websocket from './src/api/websocket';
import { Logger } from './src/utils/logger';
import { getDatabasePath } from './src/utils/paths';

const fastify = Fastify({ logger: { level: 'error' } });

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
  setHeaders: (res: any, filePath: string) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
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
