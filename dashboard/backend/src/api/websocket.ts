// WebSocket API Handler
import { CoreEngine } from '../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // Register /ws socket route
  fastify.get('/ws', { websocket: true }, (connection: any, _req: any) => {
    const socket = connection.socket;

    const token = _req.query?.token;
    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Authentication token required' }));
      socket.close();
      return;
    }
    const user = engine.auth.verifyToken(token);
    if (!user) {
      socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid token' }));
      socket.close();
      return;
    }

    // Add client socket connection to pool
    engine.registerWsClient(socket);

    // Listen for incoming websocket text packages
    socket.on('message', async (messageStr: string) => {
      try {
        const payload = JSON.parse(messageStr);

        if (payload.type === 'subscribe') {
          engine.updateSubscriptions(socket, payload.events || []);
        } else if (payload.type === 'unsubscribe') {
          engine.unsubscribe(socket, payload.events || []);
        } else if (payload.type === 'subscribe_logs' && payload.serviceId) {
          engine.updateSubscriptions(socket, [`docker.logs.${payload.serviceId}`]);
          engine.startLogPoller(payload.serviceId);
        } else if (payload.type === 'unsubscribe_logs' && payload.serviceId) {
          engine.unsubscribe(socket, [`docker.logs.${payload.serviceId}`]);
          engine.stopLogPoller(payload.serviceId);
        } else if (payload.type === 'terminal' && payload.command) {
          if (user.role !== 'admin') {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Forbidden: Admin privilege required'
              })
            );
            return;
          }
          const output = await engine.terminal.execute(payload.command);
          socket.send(
            JSON.stringify({
              type: 'terminal',
              command: payload.command,
              output: output
            })
          );
        }
      } catch (err: any) {
        socket.send(
          JSON.stringify({
            type: 'error',
            message: `Malformed websocket package payload: ${err.message}`
          })
        );
      }
    });

    // Disconnects
    socket.on('close', () => {
      engine.removeWsClient(socket);
    });

    socket.on('error', () => {
      engine.removeWsClient(socket);
      try {
        socket.terminate();
      } catch {
        // ignore connection teardown failures
      }
    });
  });
}
