import mongoose from 'mongoose';
import { createBaseSchema } from '../../core/database/BaseModel.js';

const super_adminSchema = createBaseSchema({
  // Defined fields for super-admin module
  status: { type: String, default: 'ACTIVE' }
});

export const Super_adminModel = mongoose.model('super_admin', super_adminSchema);
