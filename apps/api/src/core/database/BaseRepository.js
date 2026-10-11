import mongoose from 'mongoose';

/**
 * BaseRepository handles common CRUD operations and enforces transaction management.
 */
export class BaseRepository {
  constructor(model) {
    if (!model) {
      throw new Error('BaseRepository requires a valid Mongoose model');
    }
    this.model = model;
  }

  async findById(id, projection = null, options = {}) {
    return this.model.findById(id, projection, options).lean();
  }

  async findOne(filter, projection = null, options = {}) {
    return this.model.findOne(filter, projection, options).lean();
  }

  async find(filter = {}, projection = null, options = {}) {
    return this.model.find(filter, projection, options).lean();
  }

  async create(data, session = null) {
    const doc = new this.model(data);
    return doc.save({ session });
  }

  async updateById(id, updateData, session = null) {
    return this.model.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session
    }).lean();
  }

  async deleteById(id, session = null) {
    return this.model.findByIdAndDelete(id, { session }).lean();
  }

  /**
   * Execute multiple operations atomically within a MongoDB transaction.
   * @param {function(mongoose.ClientSession): Promise<any>} callback
   */
  async withTransaction(callback) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
