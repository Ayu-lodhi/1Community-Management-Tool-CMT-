import { shiftsRepository } from './shifts.repository.js';
import { logger } from '../../core/utils/logger.js';

export class ShiftsService {
  constructor(repository = shiftsRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const shiftsService = new ShiftsService();
