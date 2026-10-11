import { BaseRepository } from '../../core/database/BaseRepository.js';
import { ReviewsModel } from './reviews.model.js';

export class ReviewsRepository extends BaseRepository {
  constructor() {
    super(ReviewsModel);
  }
}

export const reviewsRepository = new ReviewsRepository();
