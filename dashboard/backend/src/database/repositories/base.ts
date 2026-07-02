// Base Repository class
import { DatabaseAdapter } from '../adapter';

export abstract class BaseRepository<T> {
  constructor(protected db: DatabaseAdapter) {}
  
  abstract findAll(): T[];
  abstract findById(id: string): T | undefined;
  abstract create(entity: any): T;
  abstract update(id: string, partial: Partial<T>): T | undefined;
  abstract delete(id: string): boolean;
}
