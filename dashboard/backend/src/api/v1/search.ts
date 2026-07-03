// Unified Global Search REST Subsystem API routes
import { CoreEngine } from '../../core/engine';

export default function (fastify: any, engine: CoreEngine): void {
  // 1. GET: /api/v1/search (Fuzzy search index builder)
  fastify.get('/api/v1/search', async (request: any) => {
    const query = (request.query.q || '').toLowerCase();
    if (!query) return [];

    const results: any[] = [];

    // A. Index Services
    const services = await engine.getEnrichedServices().catch(() => []);
    for (const s of services) {
      if (s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)) {
        results.push({
          type: 'service',
          id: s.id,
          title: s.name,
          subtitle: `Service manifest: ${s.description || 'Discovered stack'}`,
          action: `open-service:${s.id}`
        });
      }
    }

    // B. Index Workspaces
    const workspaces = engine.workspacesRepo.findAll();
    for (const w of workspaces) {
      if (
        w.name.toLowerCase().includes(query) ||
        (w.description || '').toLowerCase().includes(query)
      ) {
        results.push({
          type: 'workspace',
          id: w.id,
          title: w.name,
          subtitle: `Workspace window layout`,
          action: `navigate-workspace:${w.id}`
        });
      }
    }

    // C. Index Categories
    const categories = engine.categoriesRepo.findAll();
    for (const c of categories) {
      if (
        c.name.toLowerCase().includes(query) ||
        (c.description || '').toLowerCase().includes(query)
      ) {
        results.push({
          type: 'category',
          id: c.id,
          title: c.name,
          subtitle: `Section Category grouping`,
          action: `focus-category:${c.id}`
        });
      }
    }

    // D. Index Jobs
    const jobs = engine.jobs.getJobs(20);
    for (const j of jobs) {
      if (
        j.type.toLowerCase().includes(query) ||
        j.status.toLowerCase().includes(query) ||
        (j.error || '').toLowerCase().includes(query)
      ) {
        results.push({
          type: 'job',
          id: j.id,
          title: `Job: ${j.type}`,
          subtitle: `Status: ${j.status.toUpperCase()} (${j.progress}%)`,
          action: `open-job:${j.id}`
        });
      }
    }

    // E. Index Notifications
    const notifications = engine.notifier.getHistory(30);
    for (const n of notifications) {
      if (n.message.toLowerCase().includes(query) || n.origin.toLowerCase().includes(query)) {
        results.push({
          type: 'notification',
          id: String(n.time),
          title: `Notification: ${n.origin}`,
          subtitle: n.message,
          action: `open-notifications`
        });
      }
    }

    // F. Compile and Index Command Palette Commands
    const commands = [
      { id: 'system.settings', title: 'Open Settings Panel', action: 'open-settings' },
      { id: 'system.terminal', title: 'Open Direct Terminal Console', action: 'open-terminal' },
      {
        id: 'system.health',
        title: 'Open System Subsystem Health Dashboard',
        action: 'open-health'
      },
      { id: 'system.jobs', title: 'Open Asynchronous Job Center', action: 'open-jobs' },
      {
        id: 'system.designer',
        title: 'Open Visual Infrastructure Designer',
        action: 'open-designer'
      }
    ];

    // Read commands dynamically from service plugins manifests
    const plugins = engine.plugin.discover();
    plugins.forEach((p) => {
      // Dynamic commands registry builders
      commands.push({
        id: `plugin.${p.id}.restart`,
        title: `Restart ${p.name}`,
        action: `run-command:service:${p.id}:restart`
      });
      commands.push({
        id: `plugin.${p.id}.logs`,
        title: `Tail Logs for ${p.name}`,
        action: `run-command:service:${p.id}:logs`
      });
      commands.push({
        id: `plugin.${p.id}.stop`,
        title: `Stop ${p.name}`,
        action: `run-command:service:${p.id}:stop`
      });
    });

    for (const cmd of commands) {
      if (cmd.title.toLowerCase().includes(query) || cmd.id.toLowerCase().includes(query)) {
        results.push({
          type: 'command',
          id: cmd.id,
          title: cmd.title,
          subtitle: `Command Action: ${cmd.action}`,
          action: `execute-command:${cmd.action}`
        });
      }
    }

    return results.slice(0, 15);
  });
}
