import mongoose from 'mongoose';
import { createBaseSchema } from '../../core/database/BaseModel.js';

const shiftsSchema = createBaseSchema({
  // Defined fields for shifts module
  status: { type: String, default: 'ACTIVE' }
});

export const ShiftsModel = mongoose.model('shifts', shiftsSchema);
