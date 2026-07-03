// Container Provider Abstraction Subsystem
import { DockerContainer } from '../../types';

export interface ContainerProvider {
  getContainers(serverId?: string): Promise<DockerContainer[]>;
  getVersion(serverId?: string): Promise<string | null>;
  getLogs(containerId: string, serviceId: string, serverId?: string): Promise<string>;
  getImages(serverId?: string): Promise<any[]>;
  getVolumes(serverId?: string): Promise<any[]>;
  getNetworks(serverId?: string): Promise<any[]>;
  pullImage(imageName: string, serverId?: string): Promise<{ success: boolean }>;
  removeContainer(containerId: string, serverId?: string): Promise<{ success: boolean }>;
  getStats(containerId: string, serverId?: string): Promise<any>;
  executeAction(
    containerId: string | null,
    serviceId: string,
    action: string,
    serverId?: string
  ): Promise<{ success: boolean }>;
}
export default ContainerProvider;
