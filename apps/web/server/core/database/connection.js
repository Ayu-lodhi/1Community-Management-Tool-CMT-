import mongoose from 'mongoose';
import { ENV } from '../config/env.config.js';
import { logger } from '../utils/logger.js';

export async function connectDB() {
  try {
    const conn = await mongoose.connect(ENV.MONGODB_URI, {
      autoIndex: true
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    process.exit(1);
  }
}
