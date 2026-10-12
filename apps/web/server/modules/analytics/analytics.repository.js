import { BaseRepository } from '../../core/database/BaseRepository.js';
import { AnalyticsModel } from './analytics.model.js';

export class AnalyticsRepository extends BaseRepository {
  constructor() {
    super(AnalyticsModel);
  }
}

export const analyticsRepository = new AnalyticsRepository();
