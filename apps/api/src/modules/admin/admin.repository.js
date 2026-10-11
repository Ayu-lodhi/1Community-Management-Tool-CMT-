import { BaseRepository } from '../../core/database/BaseRepository.js';
import { AdminModel } from './admin.model.js';

export class AdminRepository extends BaseRepository {
  constructor() {
    super(AdminModel);
  }
}

export const adminRepository = new AdminRepository();
