// Master TypeScript Server Initializer
import path from 'path';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { CoreEngine } from './src/core/engine';
import routes from './src/api/routes';
import websocket from './src/api/websocket';
import { Logger } from './src/utils/logger';

const fastify = Fastify({ logger: { level: 'error' } });

// Register fastify websocket plugin
fastify.register(websocketPlugin);

// Serve static frontend files
fastify.register(staticPlugin, {
  root: path.join(__dirname, '../frontend'),
  prefix: '/'
});

const engine = new CoreEngine(fastify);

// Mount versioned REST and socket gateways
fastify.register(async (instance) => {
  routes(instance, engine);
  websocket(instance, engine);
});

const PORT = Number(process.env.BACKEND_PORT) || 8081;
const start = async () => {
  try {
    await engine.init();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`HomeLab Modular Control Plane (TS Engine) listening on port ${PORT}`);
  } catch (err: any) {
    Logger.error('ServerBoot', `Boot crash: ${err.message}`);
    process.exit(1);
  }
};

start();
