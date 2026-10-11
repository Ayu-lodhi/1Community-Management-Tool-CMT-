import { BaseRepository } from '../../core/database/BaseRepository.js';
import { AttendanceModel } from './attendance.model.js';

export class AttendanceRepository extends BaseRepository {
  constructor() {
    super(AttendanceModel);
  }
}

export const attendanceRepository = new AttendanceRepository();
