import { BaseRepository } from '../../core/database/BaseRepository.js';
import { ShiftsModel } from './shifts.model.js';

export class ShiftsRepository extends BaseRepository {
  constructor() {
    super(ShiftsModel);
  }
}

export const shiftsRepository = new ShiftsRepository();
