import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { startScheduler } from './jobs/scheduler.js';
import { startNotificationWorker } from './workers/notification.worker.js';
import { startCertificateWorker } from './workers/certificate.worker.js';

console.log('Starting TBI Background Workers...');

let notificationWorker = null;
let certificateWorker = null;

async function main() {
  // Connect to MongoDB for worker jobs that require database access
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tbi_platform';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected for workers.');
  } catch (mongoErr) {
    console.warn(`MongoDB worker connection warning: ${mongoErr.message} (workers will continue queue polling)`);
  }

  await startScheduler();
  notificationWorker = startNotificationWorker();
  certificateWorker = startCertificateWorker();
  console.log('All workers and schedulers running.');
}

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down workers gracefully...`);
  const closers = [];
  if (notificationWorker) closers.push(notificationWorker.close());
  if (certificateWorker) closers.push(certificateWorker.close());
  if (mongoose.connection.readyState === 1) closers.push(mongoose.disconnect());

  try {
    await Promise.allSettled(closers);
    console.log('Workers shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during worker shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

main().catch(err => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
