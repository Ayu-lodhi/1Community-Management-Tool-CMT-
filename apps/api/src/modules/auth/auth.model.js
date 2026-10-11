import mongoose from 'mongoose';
import { createBaseSchema } from '../../core/database/BaseModel.js';

const authSchema = createBaseSchema({
  // Defined fields for auth module
  status: { type: String, default: 'ACTIVE' }
});

export const AuthModel = mongoose.model('auth', authSchema);
