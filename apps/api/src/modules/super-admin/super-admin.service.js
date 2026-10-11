import { super_adminRepository } from './super-admin.repository.js';
import { logger } from '../../core/utils/logger.js';

export class Super_adminService {
  constructor(repository = super_adminRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const super_adminService = new Super_adminService();
