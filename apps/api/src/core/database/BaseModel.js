import mongoose from 'mongoose';

/**
 * Base schema helper that attaches standard timestamps and audit tracking.
 */
export function createBaseSchema(definition, options = {}) {
  const schema = new mongoose.Schema(definition, {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      }
    },
    ...options
  });

  return schema;
}
