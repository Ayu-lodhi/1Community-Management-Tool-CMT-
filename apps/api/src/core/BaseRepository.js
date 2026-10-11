// ====================================================================
// BaseRepository — ABSTRACTION + ENCAPSULATION
// --------------------------------------------------------------------
// Encapsulates all database access. Subclasses inherit common CRUD
// operations, ensuring consistent data access patterns across modules.
// ====================================================================

const { ValidationError } = require('./errors/typedErrors');

class BaseRepository {
  /**
   * @param {mongoose.Model} model - The Mongoose model to operate on
   */
  constructor(model) {
    if (!model) throw new Error('Repository requires a Mongoose model');
    this.model = model;  // Encapsulation: private reference to model
  }

  /**
   * Create a new document
   */
  async create(data, options = {}) {
    return await this.model.create([data], options).then((docs) => docs[0]);
  }

  /**
   * Find all with optional filter, sort, pagination, projection and lean
   */
  async findAll(filter = {}, options = {}) {
    const { sort = { createdAt: -1 }, limit, skip, populate, select, lean = true } = options;
    let query = this.model.find(filter);

    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (skip) query = query.skip(skip);
    if (limit) query = query.limit(limit);
    if (lean) query = query.lean();

    return await query;
  }

  /**
   * Find by ID with optional populate, select, and lean
   */
  async findById(id, populate, select, lean = false) {
    let query = this.model.findById(id);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (lean) query = query.lean();
    const doc = await query;
    if (!doc) throw new Error(`${this.model.modelName} not found`);
    return doc;
  }

  /**
   * Find one by filter with optional populate, select, and lean
   */
  async findOne(filter, populate, select, lean = false) {
    let query = this.model.findOne(filter);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (lean) query = query.lean();
    return await query;
  }

  /**
   * Update literal fields by ID. Callers must validate their allowed fields.
   */
  async updateById(id, data, populate) {
    if (!data || Object.getPrototypeOf(data) !== Object.prototype ||
        Object.keys(data).some((key) => key.startsWith('$') || key.includes('.'))) {
      throw new ValidationError('Update must be a plain object of literal fields');
    }
    let query = this.model.findByIdAndUpdate(id, { $set: data }, {
      new: true,
      runValidators: true,
    });
    if (populate) query = query.populate(populate);
    const doc = await query;
    if (!doc) throw new Error(`${this.model.modelName} not found`);
    return doc;
  }

  /**
   * Delete by ID
   */
  async deleteById(id) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new Error(`${this.model.modelName} not found`);
    return doc;
  }

  /**
   * Count documents
   */
  async count(filter = {}) {
    return await this.model.countDocuments(filter);
  }

  /**
   * Check if document exists
   */
  async exists(filter) {
    const count = await this.model.countDocuments(filter).limit(1);
    return count > 0;
  }
}

module.exports = BaseRepository;
