// Docker Socket Proxy Subsystem Client
import { decodeDockerStream } from '../utils/decoder';
import { Logger } from '../utils/logger';
import { DockerContainer } from '../types';
import { ContainerProvider } from '../core/container/provider';

export class DockerClient implements ContainerProvider {
  private proxyUrl: string;

  constructor(proxyUrl: string = 'http://docker-proxy:2375') {
    this.proxyUrl = proxyUrl;
    Logger.info('DockerSubsystem', `Proxy client initialized referencing: ${proxyUrl}`);
  }

  // 1. Retrieve docker containers list
  async getContainers(): Promise<DockerContainer[]> {
    try {
      const res = await fetch(`${this.proxyUrl}/containers/json?all=1`);
      if (!res.ok) throw new Error(`Proxy status: ${res.statusText}`);
      const data = await res.json() as DockerContainer[];
      Logger.debug('DockerSubsystem', `Fetched ${data.length} active containers.`);
      return data;
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Docker Socket Proxy is unreachable: ${err.message}`);
      throw new Error(`Docker host unreachable: ${err.message}`);
    }
  }

  // 2. Retrieve docker version
  async getVersion(): Promise<string | null> {
    try {
      const res = await fetch(`${this.proxyUrl}/version`);
      if (!res.ok) return null;
      const data = await res.json() as { Version?: string };
      return data.Version || null;
    } catch {
      return null;
    }
  }

  // 3. Retrieve logs tail buffer
  async getLogs(containerId: string, serviceId: string): Promise<string> {
    try {
      Logger.info('DockerSubsystem', `Fetching logs for [${serviceId}] (ID: ${containerId})`);
      const res = await fetch(`${this.proxyUrl}/containers/${containerId}/logs?stdout=1&stderr=1&tail=100`);
      if (!res.ok) throw new Error(res.statusText);
      const arrayBuffer = await res.arrayBuffer();
      return decodeDockerStream(Buffer.from(arrayBuffer));
    } catch (err: any) {
      Logger.warn('DockerSubsystem', `Logs fetch failed for ${serviceId}: ${err.message}`);
      return `Failed to query logs: Docker daemon returned error.`;
    }
  }

  // 4. Retrieve Docker images list
  async getImages(): Promise<any[]> {
    try {
      const res = await fetch(`${this.proxyUrl}/images/json`);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json() as any[];
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Failed to query Docker images: ${err.message}`);
      return [];
    }
  }

  // 5. Retrieve Docker volumes list
  async getVolumes(): Promise<any[]> {
    try {
      const res = await fetch(`${this.proxyUrl}/volumes`);
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json() as { Volumes?: any[] };
      return data.Volumes || [];
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Failed to query Docker volumes: ${err.message}`);
      return [];
    }
  }

  // 6. Retrieve Docker networks list
  async getNetworks(): Promise<any[]> {
    try {
      const res = await fetch(`${this.proxyUrl}/networks`);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json() as any[];
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Failed to query Docker networks: ${err.message}`);
      return [];
    }
  }

  // 7. Pull Docker image
  async pullImage(imageName: string): Promise<{ success: boolean }> {
    try {
      Logger.info('DockerSubsystem', `Requesting image pull: [${imageName}]`);
      const res = await fetch(`${this.proxyUrl}/images/create?fromImage=${encodeURIComponent(imageName)}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(res.statusText);
      await res.text(); // consume stream response
      return { success: true };
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Failed to pull image [${imageName}]: ${err.message}`);
      throw err;
    }
  }

  // 8. Remove Docker container
  async removeContainer(containerId: string): Promise<{ success: boolean }> {
    try {
      Logger.info('DockerSubsystem', `Removing container: ${containerId}`);
      const res = await fetch(`${this.proxyUrl}/containers/${containerId}?force=true&v=true`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(res.statusText);
      return { success: true };
    } catch (err: any) {
      Logger.error('DockerSubsystem', `Failed to remove container: ${err.message}`);
      throw err;
    }
  }

  // 9. Inspect Docker container
  async inspectContainer(containerId: string): Promise<any> {
    const res = await fetch(`${this.proxyUrl}/containers/${containerId}/json`);
    if (!res.ok) throw new Error(`Inspect failed: ${res.statusText}`);
    return await res.json();
  }

  // 10. Query container resources utilization statistics
  async getStats(containerId: string): Promise<any> {
    try {
      const res = await fetch(`${this.proxyUrl}/containers/${containerId}/stats?stream=false`);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json();
    } catch (err: any) {
      Logger.warn('DockerSubsystem', `Failed to fetch stats for container [${containerId}]: ${err.message}`);
      return null;
    }
  }

  // 11. Execute container lifecycle start, stop, or restart actions
  async executeAction(containerId: string | null, serviceId: string, action: string): Promise<{ success: boolean }> {
    let endpoint = '';
    
    if (action === 'toggle' || action === 'start' || action === 'stop') {
      const containers = await this.getContainers();
      const c = containers.find(item => item.Id === containerId || item.Names.some((n: string) => n === `/${serviceId}`));
      if (!c) {
        if (action === 'start') {
          // If container is missing, try recreating/launching stack (will be handled by Compose or plugins engine)
          throw new Error(`Container [${serviceId}] not found on host. Deploy service first.`);
        }
        throw new Error(`Container [${serviceId}] not found on host.`);
      }
      
      const isRunning = c.State === 'running';
      const targetAction = action === 'toggle' ? (isRunning ? 'stop' : 'start') : action;
      endpoint = `/containers/${c.Id}/${targetAction}`;
      Logger.info('DockerSubsystem', `Sending state transition command [${targetAction.toUpperCase()}] for container [${c.Id}]`);
    } else if (action === 'restart') {
      if (!containerId) throw new Error(`No active containerId specified for restarting [${serviceId}].`);
      endpoint = `/containers/${containerId}/restart`;
      Logger.info('DockerSubsystem', `Sending restart command for container [${containerId}]`);
    } else if (action === 'remove') {
      if (!containerId) throw new Error(`No active containerId specified for removing [${serviceId}].`);
      return await this.removeContainer(containerId);
    } else {
      throw new Error(`Unsupported API action: ${action}`);
    }

    const res = await fetch(`${this.proxyUrl}${endpoint}`, { method: 'POST' });
    if (res.status === 200 || res.status === 204 || res.status === 304) {
      Logger.info('DockerSubsystem', `Action [${action.toUpperCase()}] executed on container [${serviceId}]`);
      return { success: true };
    }
    const errText = await res.text();
    throw new Error(errText || `Docker Proxy returned error code: ${res.status}`);
  }
}
export default DockerClient;
