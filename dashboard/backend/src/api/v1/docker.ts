// Docker endpoints versioned REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/docker/containers
  fastify.get('/api/v1/docker/containers', async () => {
    return await engine.docker.getContainers();
  });

  // 2. GET: /api/v1/docker/images
  fastify.get('/api/v1/docker/images', async () => {
    return await engine.docker.getImages();
  });

  // 3. GET: /api/v1/docker/volumes
  fastify.get('/api/v1/docker/volumes', async () => {
    return await engine.docker.getVolumes();
  });

  // 4. GET: /api/v1/docker/networks
  fastify.get('/api/v1/docker/networks', async () => {
    return await engine.docker.getNetworks();
  });

  // 5. POST: /api/v1/docker/images (Pull image asynchronously as a job)
  fastify.post('/api/v1/docker/images', async (request: any) => {
    const { image } = request.body || {};
    const job = await engine.jobs.executeAsyncTask(
      'pull_image',
      image,
      async (updateProgress) => {
        updateProgress(10, `Initiating registry pull for image: ${image}`);
        await engine.docker.pullImage(image);
        updateProgress(100, `Successfully pulled image: ${image}`);
      }
    );
    return { success: true, jobId: job.id };
  });
}
