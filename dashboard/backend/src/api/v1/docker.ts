// Docker endpoints versioned REST Subsystem API routes
import { CoreEngine } from '../../core/engine';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/docker/containers
  fastify.get('/api/v1/docker/containers', async () => {
    return await engine.infrastructure.getContainers();
  });

  // 2. GET: /api/v1/docker/images
  fastify.get('/api/v1/docker/images', async () => {
    return await engine.infrastructure.getImages();
  });

  // 3. GET: /api/v1/docker/volumes
  fastify.get('/api/v1/docker/volumes', async () => {
    return await engine.infrastructure.getVolumes();
  });

  // 4. GET: /api/v1/docker/networks
  fastify.get('/api/v1/docker/networks', async () => {
    return await engine.infrastructure.getNetworks();
  });

  // 5. POST: /api/v1/docker/images (Pull image asynchronously as a job)
  fastify.post('/api/v1/docker/images', async (request: any) => {
    const { image } = request.body || {};
    const job = await engine.jobs.executeAsyncTask(
      'pull_image',
      image,
      async (updateProgress) => {
        updateProgress(10, `Initiating registry pull for image: ${image}`);
        await engine.infrastructure.getDocker().pullImage(image);
        updateProgress(100, `Successfully pulled image: ${image}`);
      }
    );
    return { success: true, jobId: job.id };
  });

  // 6. GET: /api/v1/docker/containers/:id/inspect
  fastify.get('/api/v1/docker/containers/:id/inspect', async (request: any) => {
    const { id } = request.params;
    return await engine.infrastructure.getDocker().inspectContainer(id);
  });

  // 7. GET: /api/v1/docker/containers/:id/logs
  fastify.get('/api/v1/docker/containers/:id/logs', async (request: any) => {
    const { id } = request.params;
    const logs = await engine.infrastructure.getDocker().getLogs(id, id);
    return { logs };
  });

  // 8. POST: /api/v1/docker/scan-compose (Scan workspace folders recursively for offline compose stacks)
  fastify.post('/api/v1/docker/scan-compose', async (request: any) => {
    const actor = request.user?.id || 'admin';
    const job = await engine.jobs.executeAsyncTask(
      'scan_compose',
      'system',
      async (updateProgress) => {
        updateProgress(10, 'Resolving system directories to scan...');
        const homeDir = os.homedir();
        const scanDirs = [
          path.resolve(process.cwd(), '..'),
          path.join(homeDir, 'Documents'),
          path.join(homeDir, 'Desktop')
        ];
        
        updateProgress(30, `Scanning directories: ${scanDirs.join(', ')}`);
        await engine.infrastructure.scanSystemComposeFiles(scanDirs);
        engine.auditRepo.log(actor, 'scan_compose', 'system', 'local', { directories: scanDirs });
        updateProgress(100, 'Successfully scanned and indexed all compose files on the host.');
      }
    );
    return { success: true, jobId: job.id };
  });

  // 9. POST: /api/v1/docker/containers/:id/autostart (Toggle autostart behavior by updating restart policy)
  fastify.post('/api/v1/docker/containers/:id/autostart', async (request: any) => {
    const { id } = request.params;
    const { enabled } = request.body || {};
    const actor = request.user?.id || 'admin';
    const policy = enabled ? 'unless-stopped' : 'no';

    try {
      execSync(`docker update --restart=${policy} ${id}`, {
        env: { DOCKER_HOST: 'tcp://docker-proxy:2375' },
        timeout: 10000,
        encoding: 'utf8'
      });
      engine.auditRepo.log(actor, 'update_restart_policy', 'container', id, { policy });
      return { success: true, policy };
    } catch (err: any) {
      const stderr = err.stderr || err.message;
      throw { statusCode: 500, message: `Failed to update autostart restart policy: ${stderr}` };
    }
  });
}
