// Plugin service wrapper scanning and validating service.yaml specifications
import { DatabaseAdapter } from '../../database/adapter';
import { PluginsManager } from '../../plugins/manager';
import { CategoryService } from './category.service';
import { PluginMetadata } from '../../types';

export class PluginService {
  private manager: PluginsManager;

  constructor(db: DatabaseAdapter, private categoryService: CategoryService) {
    this.manager = new PluginsManager(db);
  }

  // 1. Scan filesystem for manifests, calculate checksums, and verify categories
  discover(): PluginMetadata[] {
    const list = this.manager.discover();
    
    // Auto-bootstrap any categories declared in plugin specs that are missing
    list.forEach(plugin => {
      const cats = this.categoryService.getCategories();
      const match = cats.find(c => c.id === plugin.category || c.name === plugin.category);
      if (!match && plugin.category) {
        this.categoryService.createCategory({
          id: plugin.category.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: plugin.category,
          icon: 'grid',
          accentColor: 'var(--text-primary)',
          displayOrder: 99
        });
      }
    });
    
    return list;
  }
}
export default PluginService;
