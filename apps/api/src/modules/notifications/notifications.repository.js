import { BaseRepository } from '../../core/database/BaseRepository.js';
import { NotificationsModel } from './notifications.model.js';

export class NotificationsRepository extends BaseRepository {
  constructor() {
    super(NotificationsModel);
  }
}

export const notificationsRepository = new NotificationsRepository();
