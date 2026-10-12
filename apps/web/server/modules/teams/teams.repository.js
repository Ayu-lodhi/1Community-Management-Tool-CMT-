import { BaseRepository } from '../../core/database/BaseRepository.js';
import { TeamsModel } from './teams.model.js';

export class TeamsRepository extends BaseRepository {
  constructor() {
    super(TeamsModel);
  }
}

export const teamsRepository = new TeamsRepository();
