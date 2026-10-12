import mongoose from 'mongoose';
import { createBaseSchema } from '../../core/database/BaseModel.js';

const analyticsSchema = createBaseSchema({
  // Defined fields for analytics module
  status: { type: String, default: 'ACTIVE' }
});

export const AnalyticsModel = mongoose.model('analytics', analyticsSchema);
