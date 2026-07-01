// Workspace service wrapper subsystem running layouts configurations CRUD
import { DatabaseAdapter } from '../../database/adapter';
import { WorkspacesRepository } from '../../database/repositories/workspaces';
import { WidgetsRepository } from '../../database/repositories/widgets';

export class WorkspaceService {
  private workspacesRepo: WorkspacesRepository;
  private widgetsRepo: WidgetsRepository;

  constructor(db: DatabaseAdapter) {
    this.workspacesRepo = new WorkspacesRepository(db);
    this.widgetsRepo = new WidgetsRepository(db);
  }

  // 1. Query workspaces list
  getWorkspaces(): any[] {
    return this.workspacesRepo.findAll();
  }

  // 2. Insert new workspace
  createWorkspace(data: any): any {
    return this.workspacesRepo.create(data);
  }

  // 3. Update workspace properties
  updateWorkspace(id: string, data: any): any {
    return this.workspacesRepo.update(id, data);
  }

  // 4. Wipe workspace and its widgets
  deleteWorkspace(id: string): boolean {
    this.widgetsRepo.deleteByWorkspace(id);
    return this.workspacesRepo.delete(id);
  }

  // 5. Query active widget items configurations
  getWidgets(workspaceId: string): any[] {
    return this.widgetsRepo.findByWorkspace(workspaceId);
  }

  // 6. Overwrite widget structures for a workspace
  saveWidgets(workspaceId: string, widgets: any[]): void {
    this.widgetsRepo.saveLayout(workspaceId, widgets);
  }
}
export default WorkspaceService;
