// ====================================================================
// BaseRepository — ABSTRACTION + ENCAPSULATION
// --------------------------------------------------------------------
// Encapsulates all database access. Subclasses inherit common CRUD
// operations, ensuring consistent data access patterns across modules.
// ====================================================================

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
   * Find all with optional filter, sort, pagination
   */
  async findAll(filter = {}, options = {}) {
    const { sort = { createdAt: -1 }, limit, skip, populate } = options;
    let query = this.model.find(filter);

    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (skip) query = query.skip(skip);
    if (limit) query = query.limit(limit);

    return await query;
  }

  /**
   * Find by ID with optional populate
   */
  async findById(id, populate) {
    let query = this.model.findById(id);
    if (populate) query = query.populate(populate);
    const doc = await query;
    if (!doc) throw new Error(`${this.model.modelName} not found`);
    return doc;
  }

  /**
   * Find one by filter
   */
  async findOne(filter, populate) {
    let query = this.model.findOne(filter);
    if (populate) query = query.populate(populate);
    return await query;
  }

  /**
   * Update by ID
   */
  async updateById(id, data, populate) {
    let query = this.model.findByIdAndUpdate(id, data, {
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
