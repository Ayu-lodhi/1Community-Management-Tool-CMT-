import { BaseRepository } from '../../core/database/BaseRepository.js';
import { CertificatesModel } from './certificates.model.js';

export class CertificatesRepository extends BaseRepository {
  constructor() {
    super(CertificatesModel);
  }
}

export const certificatesRepository = new CertificatesRepository();
