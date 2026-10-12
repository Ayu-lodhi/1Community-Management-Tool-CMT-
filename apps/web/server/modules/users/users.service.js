import { usersRepository } from './users.repository.js';
import { logger } from '../../core/utils/logger.js';

export class UsersService {
  constructor(repository = usersRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const usersService = new UsersService();
