// Terminal Pseudo-Shell Parser
import { DockerClient } from '../docker/client';
import { MetricsCollector } from '../metrics/collector';
import { Logger } from '../utils/logger';

export class TerminalEngine {
  private dockerClient: DockerClient;
  private metricsCollector: MetricsCollector;

  constructor(dockerClient: DockerClient, metricsCollector: MetricsCollector) {
    this.dockerClient = dockerClient;
    this.metricsCollector = metricsCollector;
    Logger.info('TerminalSubsystem', 'Console shell engine active.');
  }

  // Parses terminal inputs and outputs results safely
  async execute(commandStr: string): Promise<string> {
    const cmd = commandStr.trim();
    if (!cmd) return '';

    Logger.audit('TerminalSubsystem', `Shell input execution request: [${cmd}]`);

    if (cmd === 'clear') {
      return '__CLEAR__';
    }

    if (cmd === 'uptime') {
      const stats = this.metricsCollector.getMetrics();
      return ` ${new Date().toLocaleTimeString('en-US', { hour12: false })} up ${stats.uptime}, load average: 1.25, 1.10, 0.95`;
    }

    if (cmd === 'df -h /dev/sda1' || cmd === 'df -h' || cmd === 'df') {
      const stats = this.metricsCollector.getMetrics();
      if (stats.diskGbTotal !== null && stats.diskGbUsed !== null && stats.disk !== null) {
        const free = stats.diskGbTotal - stats.diskGbUsed;
        return `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       ${stats.diskGbTotal}G  ${stats.diskGbUsed}G  ${free}G  ${stats.disk}% /`;
      } else {
        return `df: /dev/sda1: Exporter Disk Scrape Offline (Metrics Unavailable)`;
      }
    }

    if (cmd.startsWith('docker stats')) {
      const containers = await this.dockerClient.getContainers();
      const headers = 'CONTAINER       CPU %     MEM USAGE / LIMIT     STATUS\n';
      const rows = containers.map(c => {
        const name = c.Names && c.Names[0] ? c.Names[0].substring(1) : 'unknown';
        const paddedName = name.padEnd(15);
        const cpu = c.State === 'running' ? 'N/A' : '0.00%';
        const ram = c.State === 'running' ? 'N/A' : '0.00%';
        const status = c.Status || 'Offline';
        return `${paddedName} ${cpu.padEnd(9)} ${ram.padEnd(20)} ${status}`;
      }).join('\n');
      return headers + rows;
    }

    if (cmd.startsWith('docker logs ')) {
      const serviceId = cmd.replace('docker logs ', '').trim();
      const containers = await this.dockerClient.getContainers();
      const match = containers.find(c => c.Names.some((n: string) => n === `/${serviceId}` || n.endsWith(`-${serviceId}`)));
      if (!match) {
        return `Container error: No container matches service ID [${serviceId}].`;
      }
      return await this.dockerClient.getLogs(match.Id, serviceId);
    }

    if (cmd === 'help') {
      return 'Available shell commands:\n- clear           Clear console buffer\n- uptime          Print host system uptime\n- df -h           Show root storage allocation stats\n- docker stats    Display active container utilization ratios\n- docker logs ID  Fetch stdout stream for specific service';
    }

    return `bash: ${cmd}: command not found. Type "help" for a list of valid commands.`;
  }
}
