import { reviewsRepository } from './reviews.repository.js';
import { logger } from '../../core/utils/logger.js';

export class ReviewsService {
  constructor(repository = reviewsRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const reviewsService = new ReviewsService();
