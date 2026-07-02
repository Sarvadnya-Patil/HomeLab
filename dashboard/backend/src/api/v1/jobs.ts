// Asynchronous Jobs history query REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. Query jobs history list
  fastify.get('/api/v1/jobs', async (request: any) => {
    const limit = Number(request.query.limit) || 50;
    return engine.jobs.getJobs(limit);
  });

  // 2. Query single job status
  fastify.get('/api/v1/jobs/:id', async (request: any, reply: any) => {
    const { id } = request.params;
    const job = engine.jobs.getJob(id);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    return job;
  });
}
