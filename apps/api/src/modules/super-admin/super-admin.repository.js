import { BaseRepository } from '../../core/database/BaseRepository.js';
import { Super_adminModel } from './super-admin.model.js';

export class Super_adminRepository extends BaseRepository {
  constructor() {
    super(Super_adminModel);
  }
}

export const super_adminRepository = new Super_adminRepository();
