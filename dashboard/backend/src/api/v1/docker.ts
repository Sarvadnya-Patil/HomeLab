// Docker endpoints versioned REST Subsystem API routes
import { CoreEngine } from '../../core/engine';
import path from 'path';

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
        const userprofile = process.env.USERPROFILE || 'C:\\Users\\developer';
        const scanDirs = [
          'C:\\projects',
          path.join(userprofile, 'Documents'),
          path.join(userprofile, 'Desktop')
        ];
        
        updateProgress(30, `Scanning directories: ${scanDirs.join(', ')}`);
        await engine.infrastructure.scanSystemComposeFiles(scanDirs);
        updateProgress(100, 'Successfully scanned and indexed all compose files on the host.');
      }
    );
    return { success: true, jobId: job.id };
  });
}
