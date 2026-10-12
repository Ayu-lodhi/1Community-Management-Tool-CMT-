import { BaseRepository } from '../../core/database/BaseRepository.js';
import { UsersModel } from './users.model.js';

export class UsersRepository extends BaseRepository {
  constructor() {
    super(UsersModel);
  }
}

export const usersRepository = new UsersRepository();
