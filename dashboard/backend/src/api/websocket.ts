// WebSocket API Handler
import { CoreEngine } from '../core/engine';
import { Client as SSHClient } from 'ssh2';
import { decryptSecret } from '../utils/security';

export default function (fastify: any, engine: CoreEngine): void {
  // Register /ws/terminal socket route for real-time interactive SSH
  fastify.get('/ws/terminal', { websocket: true }, (connection: any, _req: any) => {
    const socket = connection.socket;

    const token = _req.query?.token;
    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Authentication token required' }));
      socket.close();
      return;
    }
    const user = engine.auth.verifyToken(token);
    if (!user || user.role !== 'admin') {
      socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Admin privilege required' }));
      socket.close();
      return;
    }

    const sshHost = engine.settingsRepo.get('ssh.host');
    const sshPort = Number(engine.settingsRepo.get('ssh.port')) || 22;
    const sshUser = engine.settingsRepo.get('ssh.user');
    const sshAuthType = engine.settingsRepo.get('ssh.authType') || 'password';
    const encryptedPass = engine.settingsRepo.get('ssh.password') || '';
    const encryptedKey = engine.settingsRepo.get('ssh.privateKey') || '';

    if (!sshHost || !sshUser) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: 'SSH settings not configured. Please save credentials in Settings -> SSH Configuration first.'
        })
      );
      socket.close();
      return;
    }

    const sshClient = new SSHClient();

    sshClient.on('ready', () => {
      // Open interactive shell channel
      sshClient.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          socket.send(JSON.stringify({ type: 'error', message: `SSH Shell error: ${err.message}` }));
          socket.close();
          return;
        }

        // Forward raw keypresses or commands from WebSocket to SSH stream
        socket.on('message', (message: string) => {
          try {
            const payload = JSON.parse(message);
            if (payload.type === 'data') {
              stream.write(payload.data);
            } else if (payload.type === 'resize') {
              stream.setWindow(payload.rows, payload.cols, 0, 0);
            }
          } catch {
            // Fallback: if message is not JSON, write directly
            stream.write(message);
          }
        });

        // Forward shell stdout/stderr back to the client WebSocket
        stream.on('data', (data: Buffer) => {
          socket.send(data.toString('utf-8'));
        });

        stream.on('close', () => {
          socket.close();
        });
      });
    });

    sshClient.on('error', (err: any) => {
      socket.send(JSON.stringify({ type: 'error', message: `SSH connection error: ${err.message}` }));
      socket.close();
    });

    sshClient.on('close', () => {
      socket.close();
    });

    socket.on('close', () => {
      try {
        sshClient.end();
      } catch {
        // ignore connection teardown failures
      }
    });

    const connOpts: any = {
      host: sshHost,
      port: sshPort,
      username: sshUser,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3
    };

    if (sshAuthType === 'privateKey') {
      connOpts.privateKey = decryptSecret(encryptedKey);
    } else {
      connOpts.password = decryptSecret(encryptedPass);
    }

    sshClient.connect(connOpts);
  });

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
