import mongoose from 'mongoose';
import { ENV } from '../config/env.config.js';
import { logger } from '../utils/logger.js';

export async function connectDB() {
  try {
    const options = {
      autoIndex: process.env.NODE_ENV !== 'production'
    };

    if (process.env.DB_TLS_CA_FILE) {
      options.tls = true;
      options.tlsCAFile = process.env.DB_TLS_CA_FILE;
    }
    if (process.env.DB_REPLICA_SET) {
      options.replicaSet = process.env.DB_REPLICA_SET;
    }
    if (process.env.DB_RETRY_WRITES !== undefined) {
      options.retryWrites = process.env.DB_RETRY_WRITES === 'true';
    }
    if (process.env.DB_MAX_POOL_SIZE) {
      options.maxPoolSize = parseInt(process.env.DB_MAX_POOL_SIZE, 10);
    }
    if (process.env.DB_READ_PREFERENCE) {
      options.readPreference = process.env.DB_READ_PREFERENCE;
    }

    const conn = await mongoose.connect(ENV.MONGODB_URI, options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    process.exit(1);
  }
}
