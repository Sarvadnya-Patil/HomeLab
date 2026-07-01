// Category service wrapper subsystem managing groups and service mappings
import { DatabaseAdapter } from '../../database/adapter';
import { CategoriesRepository } from '../../database/repositories/categories';
import { ServicesRepository } from '../../database/repositories/services';

export class CategoryService {
  private categoriesRepo: CategoriesRepository;
  private servicesRepo: ServicesRepository;

  constructor(db: DatabaseAdapter) {
    this.categoriesRepo = new CategoriesRepository(db);
    this.servicesRepo = new ServicesRepository(db);
  }

  // 1. Fetch categories list
  getCategories(): any[] {
    return this.categoriesRepo.findAll();
  }

  // 2. Insert category
  createCategory(data: any): any {
    return this.categoriesRepo.create(data);
  }

  // 3. Update category details
  updateCategory(id: string, data: any): any {
    return this.categoriesRepo.update(id, data);
  }

  // 4. Wipe category
  deleteCategory(id: string): boolean {
    return this.categoriesRepo.delete(id);
  }

  // 5. Reassign category mapping for a service
  saveServiceOverride(serviceId: string, categoryId: string, serverId: string): void {
    this.servicesRepo.saveOverride(serviceId, categoryId, serverId);
  }

  // 6. Fetch overriding assignments
  getOverrides(): Record<string, string> {
    return this.servicesRepo.getOverrides();
  }
}
export default CategoryService;
