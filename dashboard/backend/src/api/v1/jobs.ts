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

  // 3. Cancel/abort a running job
  fastify.post('/api/v1/jobs/:id/cancel', async (request: any, reply: any) => {
    const { id } = request.params;
    const job = engine.jobs.getJob(id);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    if (job.status !== 'running' && job.status !== 'pending') {
      return reply.status(400).send({ error: 'Job is not running or pending' });
    }
    engine.jobs.updateJob(id, {
      status: 'failed',
      error: 'Job was manually cancelled by operator.',
      logs: `${job.logs || ''}\n[ABORT] Job was manually cancelled by operator.`
    });
    return { success: true };
  });
}
