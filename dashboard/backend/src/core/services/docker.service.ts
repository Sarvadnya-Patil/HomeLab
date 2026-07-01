// Docker service wrapper subsystem running container, image, and network API streams
import { DatabaseAdapter } from '../../database/adapter';
import { AuditRepository } from '../../database/repositories/audit';
import { DockerClient } from '../../docker/client';
import { DockerContainer } from '../../types';

export class DockerService {
  private client: DockerClient;
  private auditRepo: AuditRepository;

  constructor(db: DatabaseAdapter) {
    const proxyUrl = process.env.DOCKER_PROXY_URL || 'http://docker-proxy:2375';
    this.client = new DockerClient(proxyUrl);
    this.auditRepo = new AuditRepository(db);
  }

  // 1. Fetch container arrays
  async getContainers(): Promise<DockerContainer[]> {
    return this.client.getContainers();
  }

  // 2. Fetch Docker host version
  async getVersion(): Promise<string | null> {
    return this.client.getVersion();
  }

  // 3. Retrieve stdout/stderr logs tail buffer
  async getLogs(containerId: string, serviceId: string): Promise<string> {
    return this.client.getLogs(containerId, serviceId);
  }

  // 4. Retrieve image registry indexes
  async getImages(): Promise<any[]> {
    return this.client.getImages();
  }

  // 5. Retrieve volumes list
  async getVolumes(): Promise<any[]> {
    return this.client.getVolumes();
  }

  // 6. Retrieve networks list
  async getNetworks(): Promise<any[]> {
    return this.client.getNetworks();
  }

  // 7. Pull a remote image tag
  async pullImage(image: string): Promise<{ success: boolean }> {
    return this.client.pullImage(image);
  }

  // 8. Retrieve container statistics
  async getStats(containerId: string): Promise<any> {
    return this.client.getStats(containerId);
  }

  // 9. Execute start, stop, restart, or recreate actions and write security logs
  async executeAction(containerId: string | null, serviceId: string, action: string): Promise<{ success: boolean }> {
    const res = await this.client.executeAction(containerId, serviceId, action);
    this.auditRepo.log('admin', `container_${action}`, 'service', serviceId, { containerId });
    return res;
  }
}
export default DockerService;
