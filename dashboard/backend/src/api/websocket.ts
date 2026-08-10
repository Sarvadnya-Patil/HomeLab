// WebSocket API Handler
import { CoreEngine } from '../core/engine';
import { Client as SSHClient } from 'ssh2';
import { decryptSecret } from '../utils/security';
import { spawn } from 'child_process';
import * as os from 'os';

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
    const sshAuthType = engine.settingsRepo.get('ssh.authType') || 'password';

    if (!sshHost) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: 'SSH host not configured. Please save host settings in Settings -> SSH Configuration first.'
        })
      );
      socket.close();
      return;
    }

    if (sshHost === 'local') {
      const isWindows = os.platform() === 'win32';
      const shellCmd = isWindows ? 'powershell.exe' : 'bash';
      const shellArgs = isWindows ? ['-NoLogo', '-NoExit'] : ['-i'];

      const shellProcess = spawn(shellCmd, shellArgs, {
        env: {
          ...process.env,
          TERM: 'xterm-color',
          COLORTERM: 'truecolor'
        },
        shell: true
      });

      shellProcess.stdout.on('data', (data: Buffer) => {
        socket.send(data.toString('utf-8'));
      });
      shellProcess.stderr.on('data', (data: Buffer) => {
        socket.send(data.toString('utf-8'));
      });

      shellProcess.on('error', (err) => {
        socket.send(JSON.stringify({ type: 'error', message: `Local shell error: ${err.message}` }));
        socket.close();
      });

      shellProcess.on('close', () => {
        socket.close();
      });

      socket.on('message', (message: string) => {
        try {
          const payload = JSON.parse(message);
          if (payload.type === 'data') {
            shellProcess.stdin.write(payload.data);
          }
        } catch {
          shellProcess.stdin.write(message);
        }
      });

      socket.on('close', () => {
        try {
          shellProcess.kill();
        } catch {}
      });

      return;
    }

    let isAuthenticated = false;
    let sshClient: SSHClient | null = null;

    // Timeout if user doesn't send authentication payload within 15 seconds
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        socket.send(JSON.stringify({ type: 'error', message: 'SSH Authentication Timeout: Login credentials not received.' }));
        socket.close();
      }
    }, 15000);

    // Setup SSH Client connection once credentials are sent over WS
    const connectSSH = (username: string, secret: string) => {
      sshClient = new SSHClient();

      sshClient.on('ready', () => {
        // Open interactive shell channel
        sshClient!.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
          if (err) {
            socket.send(JSON.stringify({ type: 'error', message: `SSH Shell error: ${err.message}` }));
            socket.close();
            return;
          }

          // Forward shell stdout/stderr back to the client WebSocket
          stream.on('data', (data: Buffer) => {
            socket.send(data.toString('utf-8'));
          });

          stream.on('close', () => {
            socket.close();
          });

          // Forward socket inputs to shell stream
          socket.on('message', (message: string) => {
            try {
              const payload = JSON.parse(message);
              if (payload.type === 'data') {
                stream.write(payload.data);
              } else if (payload.type === 'resize') {
                stream.setWindow(payload.rows, payload.cols, 0, 0);
              }
            } catch {
              // Write raw message block directly
              stream.write(message);
            }
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

      const connOpts: any = {
        host: sshHost,
        port: sshPort,
        username: username,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3
      };

      if (sshAuthType === 'privateKey') {
        connOpts.privateKey = secret;
      } else {
        connOpts.password = secret;
      }

      sshClient.connect(connOpts);
    };

    socket.on('message', (message: string) => {
      if (!isAuthenticated) {
        try {
          const payload = JSON.parse(message);
          if (payload.type === 'auth') {
            clearTimeout(authTimeout);
            isAuthenticated = true;
            const { username, secret } = payload;
            if (!username || !secret) {
              socket.send(JSON.stringify({ type: 'error', message: 'SSH Username and Credentials are required.' }));
              socket.close();
              return;
            }
            connectSSH(username, secret);
          } else {
            socket.send(JSON.stringify({ type: 'error', message: 'SSH Authentication Required.' }));
            socket.close();
          }
        } catch {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid authentication payload format.' }));
          socket.close();
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      if (sshClient) {
        try {
          sshClient.end();
        } catch {
          // ignore connection teardown failures
        }
      }
    });
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
