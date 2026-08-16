// WebSocket API Handler
import { CoreEngine } from '../core/engine';
import { Client as SSHClient } from 'ssh2';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
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
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '3'
        },
        shell: true
      });

      let localBuffer: string[] = [];
      let localFlushImmediate: NodeJS.Immediate | null = null;

      const queueLocalOutput = (data: Buffer) => {
        localBuffer.push(data.toString('utf-8'));
        if (!localFlushImmediate) {
          localFlushImmediate = setImmediate(() => {
            if (socket.readyState === 1) { // WebSocket.OPEN
              socket.send(localBuffer.join(''));
            }
            localBuffer = [];
            localFlushImmediate = null;
          });
        }
      };

      shellProcess.stdout.on('data', queueLocalOutput);
      shellProcess.stderr.on('data', queueLocalOutput);

      shellProcess.on('error', (err) => {
        socket.send(JSON.stringify({ type: 'error', message: `Local shell error: ${err.message}` }));
        socket.close();
      });

      shellProcess.on('close', () => {
        if (localFlushImmediate) {
          clearImmediate(localFlushImmediate);
          localFlushImmediate = null;
        }
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
        } catch {
          // Ignore process teardown failures
        }
      });

      return;
    }

    let isAuthenticated = false;
    let sshClient: SSHClient | null = null;

    // Timeout if user doesn't send authentication payload within 60 seconds
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        socket.send(JSON.stringify({ type: 'error', message: 'SSH Authentication Timeout: Login credentials not received.' }));
        socket.close();
      }
    }, 60000);

    // Heartbeat ping to keep WebSocket connection alive and prevent reverse proxy idle timeouts
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) { // WebSocket.OPEN
        try {
          socket.ping();
        } catch {
          // ignore
        }
      }
    }, 20000);

    // Setup SSH Client connection once credentials are sent over WS
    const connectSSH = (username: string, secret: string, cols: number, rows: number) => {
      sshClient = new SSHClient();

      sshClient.on('ready', () => {
        sshClient!.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
          if (err) {
            socket.send(JSON.stringify({ type: 'error', message: `SSH Shell error: ${err.message}` }));
            socket.close();
            return;
          }

          // Forward shell stdout/stderr back to the client WebSocket
          let sshBuffer: string[] = [];
          let sshFlushImmediate: NodeJS.Immediate | null = null;

          stream.on('data', (data: Buffer) => {
            sshBuffer.push(data.toString('utf-8'));
            if (!sshFlushImmediate) {
              sshFlushImmediate = setImmediate(() => {
                if (socket.readyState === 1) { // WebSocket.OPEN
                  socket.send(sshBuffer.join(''));
                }
                sshBuffer = [];
                sshFlushImmediate = null;
              });
            }
          });

          stream.on('close', () => {
            if (sshFlushImmediate) {
              clearImmediate(sshFlushImmediate);
              sshFlushImmediate = null;
            }
            socket.close();
          });

          // Forward socket inputs to shell stream
          socket.on('message', (message: string) => {
            try {
              const payload = JSON.parse(message);
              if (payload.type === 'data') {
                stream.write(payload.data);
              } else if (payload.type === 'resize') {
                const cols = Number(payload.cols) || 80;
                const rows = Number(payload.rows) || 24;
                stream.setWindow(rows, cols, 0, 0);
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
        keepaliveCountMax: 3,
        readyTimeout: 60000
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
            const { username, secret, cols, rows } = payload;
            if (!username || !secret) {
              socket.send(JSON.stringify({ type: 'error', message: 'SSH Username and Credentials are required.' }));
              socket.close();
              return;
            }
            const initialCols = Number(cols) || 80;
            const initialRows = Number(rows) || 24;
            connectSSH(username, secret, initialCols, initialRows);
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
      clearInterval(pingInterval);
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

  // Register /ws/desktop route for WebRTC & WebSocket remote desktop signaling
  fastify.get('/ws/desktop', { websocket: true }, (connection: any, _req: any) => {
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

    const rdpEnabled = engine.settingsRepo.get('desktop.rdp.enabled') === 'true';
    const rdpUser = engine.settingsRepo.get('desktop.rdp.username') || '';
    const encryptedPass = engine.settingsRepo.get('desktop.rdp.password') || '';
    const rdpPass = encryptedPass ? decryptSecret(encryptedPass) : '';

    const pythonScript = path.join(__dirname, 'desktop_streamer.py');
    let pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    let spawnArgs = [pythonScript];

    if (process.platform === 'linux') {
      // Run the python script inside the host's network namespace (nsenter -t 1 -n)
      // This allows it to connect directly to the host's 127.0.0.1:3389 RDP server without firewall blocks,
      // while still keeping the container's filesystem mount namespace intact.
      pythonCmd = 'nsenter';
      spawnArgs = ['-t', '1', '-n', '--', 'python3', pythonScript];
    }

    const hostUser = engine.settingsRepo.get('desktop.rdp.hostUser') || '';
    if (rdpEnabled && rdpUser && rdpPass) {
      spawnArgs.push('--rdp-user', rdpUser, '--rdp-pass', rdpPass);
      if (hostUser) {
        spawnArgs.push('--host-user', hostUser);
      }
    }

    const streamer = spawn(pythonCmd, spawnArgs);

    let stdoutBuffer = '';
    streamer.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      let newlineIdx = stdoutBuffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = stdoutBuffer.substring(0, newlineIdx).trim();
        stdoutBuffer = stdoutBuffer.substring(newlineIdx + 1);
        if (line) {
          try {
            const payload = JSON.parse(line);
            socket.send(JSON.stringify(payload));
          } catch (err) {
            // Discard parsing errors or non-JSON messages gracefully
          }
        }
        newlineIdx = stdoutBuffer.indexOf('\n');
      }
    });

    streamer.stderr.on('data', (data: Buffer) => {
      console.error(`[DesktopStreamer Debug] ${data.toString().trim()}`);
    });

    socket.on('message', (messageStr: string) => {
      if (streamer && !streamer.killed) {
        try {
          streamer.stdin.write(messageStr + '\n');
        } catch {
          // ignore pipe write errors
        }
      }
    });

    socket.on('close', () => {
      if (streamer) {
        try {
          streamer.kill();
        } catch {
          // ignore process kill failure
        }
      }
    });

    socket.on('error', () => {
      if (streamer) {
        try {
          streamer.kill();
        } catch {
          // ignore process kill failure
        }
      }
    });
  });
}
