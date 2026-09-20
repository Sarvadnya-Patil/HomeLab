import { test } from 'node:test';
import assert from 'assert';
import fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { CoreEngine } from '../core/engine';
import registerRoutes from '../api/routes';
import registerWebsocket from '../api/websocket';
import { ServiceRegistry } from '../core/registry';

process.env.JWT_SECRET = 'test-secret-key-32-chars-long-12345';
process.env.DOCKER_PROXY_URL = 'http://127.0.0.1:2375';

async function buildApp() {
  ServiceRegistry.resetInstance();
  const app = fastify();
  await app.register(websocketPlugin);
  const engine = new CoreEngine(app);
  await engine.init(':memory:');
  registerRoutes(app, engine);
  registerWebsocket(app, engine);
  await app.ready();
  return { app, engine };
}

function addUser(engine: any, role: 'viewer' | 'editor' | 'admin') {
  engine.usersRepo.create({
    id: `ws-${role}`,
    username: `ws-${role}`,
    password: engine.auth.hashPassword('pw-not-used'),
    displayName: role,
    role,
    avatar: ''
  });
  return `ws-${role}`;
}

/** Opens a socket and collects what the server sends until it closes or `settleMs` passes. */
async function connect(app: any, path: string, settleMs = 400) {
  const messages: any[] = [];
  let closed = false;
  // The server may send its rejection the instant the socket opens, so listeners must be attached
  // in onInit, before the connection is established, or that first message would be missed.
  const ws = await app.injectWS(path, {}, {
    onInit: (socket: any) => {
      socket.on('message', (data: any) => {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch {
          messages.push(data.toString());
        }
      });
      socket.on('close', () => {
        closed = true;
      });
    }
  });
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  const result = { messages, closed, open: ws.readyState === 1 };
  try {
    ws.terminate();
  } catch {
    // already closed
  }
  return result;
}

const hasError = (messages: any[], fragment: string) =>
  messages.some((m) => m && m.type === 'error' && String(m.message).includes(fragment));

test('WebSocket authentication', async (t) => {
  await t.test('the desktop daemon endpoint refuses connections without the configured token', async () => {
    const { app, engine } = await buildApp();

    // Injected connections originate from loopback, exactly what a same-host reverse proxy looks like.
    const noToken = await connect(app, '/ws/desktop/daemon');
    assert.ok(hasError(noToken.messages, 'Unauthorized daemon credentials'), 'no token is refused');
    assert.ok(noToken.closed, 'and the socket is closed');

    const guessed = await connect(app, '/ws/desktop/daemon?token=daemon_default_secret');
    assert.ok(hasError(guessed.messages, 'Unauthorized daemon credentials'), 'the old built-in secret is refused');

    engine.settingsRepo.set('desktop.rdp.daemonToken', 'installed-token-value', 'desktop');
    const wrong = await connect(app, '/ws/desktop/daemon?token=not-the-token');
    assert.ok(hasError(wrong.messages, 'Unauthorized daemon credentials'), 'a wrong token is refused');

    const right = await connect(app, '/ws/desktop/daemon?token=installed-token-value');
    assert.ok(!hasError(right.messages, 'Unauthorized'), 'the installed token is accepted');
    assert.ok(right.open, 'and the socket stays open');

    engine.stop();
    await app.close();
  });

  await t.test('browser sockets need a valid single-use ticket', async () => {
    const { app, engine } = await buildApp();
    const adminId = addUser(engine, 'admin');

    const none = await connect(app, '/ws');
    assert.ok(hasError(none.messages, 'ticket required'), 'no ticket is refused');

    const oldStyle = await connect(app, '/ws?token=some-session-token');
    assert.ok(hasError(oldStyle.messages, 'ticket required'), 'a session token in the URL is no longer accepted');

    const ticket = engine.auth.issueWsTicket(adminId);
    const first = await connect(app, `/ws?ticket=${ticket}`);
    assert.ok(!hasError(first.messages, 'Unauthorized'), 'a fresh ticket is accepted');
    assert.ok(first.open, 'and the socket stays open');

    const replay = await connect(app, `/ws?ticket=${ticket}`);
    assert.ok(hasError(replay.messages, 'ticket required'), 'the same ticket cannot be used twice');

    engine.stop();
    await app.close();
  });

  await t.test('signing out closes the sockets the user already has open', async () => {
    const { app, engine } = await buildApp();
    const adminId = addUser(engine, 'admin');
    const other = addUser(engine, 'editor');

    let adminClosed = false;
    let otherClosed = false;
    const track = (mark: () => void) => ({
      onInit: (socket: any) => {
        socket.on('close', mark);
      }
    });
    const adminSocket = await app.injectWS(`/ws?ticket=${engine.auth.issueWsTicket(adminId)}`, {}, track(() => (adminClosed = true)));
    const otherSocket = await app.injectWS(`/ws?ticket=${engine.auth.issueWsTicket(other)}`, {}, track(() => (otherClosed = true)));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(adminSocket.readyState, 1, 'admin socket is open before sign-out');

    engine.auth.revokeSessions(adminId);
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.ok(adminClosed, 'the signed-out user socket is closed by the server');
    assert.ok(!otherClosed, 'another user socket is left alone');

    otherSocket.terminate();
    engine.stop();
    await app.close();
  });

  await t.test('the terminal and desktop sockets require the admin role', async () => {
    const { app, engine } = await buildApp();
    const editorId = addUser(engine, 'editor');

    for (const path of ['/ws/terminal', '/ws/desktop']) {
      const ticket = engine.auth.issueWsTicket(editorId);
      const res = await connect(app, `${path}?ticket=${ticket}`);
      assert.ok(hasError(res.messages, 'Admin privilege required'), `${path} refuses an editor`);
      assert.ok(res.closed, `${path} closes the socket`);
    }

    engine.stop();
    await app.close();
  });
});
