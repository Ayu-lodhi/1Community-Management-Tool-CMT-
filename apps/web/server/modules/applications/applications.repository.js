import { BaseRepository } from '../../core/database/BaseRepository.js';
import { ApplicationsModel } from './applications.model.js';

export class ApplicationsRepository extends BaseRepository {
  constructor() {
    super(ApplicationsModel);
  }
}

export const applicationsRepository = new ApplicationsRepository();
