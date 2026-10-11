import mongoose from 'mongoose';
import { createBaseSchema } from '../../core/database/BaseModel.js';

const usersSchema = createBaseSchema({
  // Defined fields for users module
  status: { type: String, default: 'ACTIVE' }
});

export const UsersModel = mongoose.model('users', usersSchema);
