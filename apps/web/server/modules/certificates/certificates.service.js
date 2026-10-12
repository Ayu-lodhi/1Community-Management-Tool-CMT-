import { certificatesRepository } from './certificates.repository.js';
import { logger } from '../../core/utils/logger.js';

export class CertificatesService {
  constructor(repository = certificatesRepository) {
    this.repository = repository;
  }

  async getById(id) {
    return this.repository.findById(id);
  }
}

export const certificatesService = new CertificatesService();
