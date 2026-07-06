// Metrics service wrapper subsystem collecting and writing performance stats
import { DatabaseAdapter } from '../../database/adapter';
import { MetricsRepository, MetricsRecord } from '../../database/repositories/metrics';
import { MetricsCollector } from '../../metrics/collector';
import { DockerService } from './docker.service';

export class MetricsService {
  private collector: MetricsCollector;
  private repo: MetricsRepository;

  constructor(
    private db: DatabaseAdapter,
    private docker: DockerService
  ) {
    const nodeExporterUrl = process.env.NODE_EXPORTER_URL || 'http://node-exporter:9100';
    this.collector = new MetricsCollector(nodeExporterUrl);
    this.repo = new MetricsRepository(db);
  }

  // 1. Scrape system resources utilization merged with container counters
  async collect(): Promise<any> {
    try {
      const row = this.db.get<any>('SELECT value FROM settings WHERE key = ?', 'server.hostname');
      if (row && row.value) {
        this.collector.setHostname(row.value);
      }
    } catch {
      // Ignore settings lookup failures
    }

    return this.collector.collect(this.docker);
  }

  // 2. Fetch last compiled metrics payload
  getLatestMetrics(): any {
    return this.collector.getMetrics();
  }

  getMetrics(): any {
    return this.collector.getMetrics();
  }

  // 3. Save snapshot to SQLite historical records
  saveSnapshot(stats: any): void {
    this.repo.save({
      cpuPercent: stats.cpu || 0,
      ramPercent: stats.ram || 0,
      diskPercent: stats.disk || 0,
      gpuPercent: stats.gpu || 0
    });
  }

  // 4. Retrieve historical timeline arrays
  getHistory(limit: number): MetricsRecord[] {
    return this.repo.getHistory(limit);
  }

  // 5. Prune metrics older than retention limit
  prune(retentionHours: number): void {
    this.repo.prune(retentionHours);
  }
}
export default MetricsService;
