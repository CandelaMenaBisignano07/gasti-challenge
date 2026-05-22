import { Injectable } from '@nestjs/common';
import type {
  CategoriesRepository,
  CustomCategories,
} from '../../shared/domain/custom-categories';

@Injectable()
export class JsonCategoriesRepository implements CategoriesRepository {
  async all(): Promise<CustomCategories> {
    throw new Error('TODO Task 2.1');
  }
  async add(_name: string, _description: string): Promise<void> {
    throw new Error('TODO Task 2.1');
  }
  async remove(_name: string): Promise<void> {
    throw new Error('TODO Task 2.1');
  }
  async rename(_from: string, _to: string): Promise<void> {
    throw new Error('TODO Task 2.1');
  }
  async setDescription(_name: string, _description: string): Promise<void> {
    throw new Error('TODO Task 2.1');
  }
}
