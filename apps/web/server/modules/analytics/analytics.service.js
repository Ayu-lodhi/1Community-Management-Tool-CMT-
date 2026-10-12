import { analyticsRepository } from './analytics.repository.js';
import { logger } from '../../core/utils/logger.js';

export class AnalyticsService {
  constructor(repository = analyticsRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const analyticsService = new AnalyticsService();
