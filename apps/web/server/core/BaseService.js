// ====================================================================
// BaseService — ABSTRACTION + ENCAPSULATION
// --------------------------------------------------------------------
// Provides business logic abstraction. Subclasses define their own
// rules but inherit standard CRUD + validation patterns.
// ====================================================================

class BaseService {
  /**
   * @param {BaseRepository} repository - Injected repository (Dependency Injection)
   */
  constructor(repository) {
    if (!repository) throw new Error('Service requires a repository');
    this.repository = repository;  // Encapsulation
  }

  /**
   * Default CRUD (can be overridden by subclasses — POLYMORPHISM)
   */
  async getAll(filter = {}, options = {}) {
    return await this.repository.findAll(filter, options);
  }

  async getById(id, populate) {
    return await this.repository.findById(id, populate);
  }

  async create(data) {
    return await this.repository.create(data);
  }

  async update(id, data) {
    return await this.repository.updateById(id, data);
  }

  async delete(id) {
    return await this.repository.deleteById(id);
  }

  /**
   * ABSTRACT method — subclasses MUST implement
   * Enforces validation contract (ABSTRACTION)
   */
  validate(_data) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Helper: sanitize before saving (can be overridden — POLYMORPHISM)
   */
  sanitize(data) {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== '' && value !== null && value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}

module.exports = BaseService;
