import { Worker } from 'bullmq';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { checkAndSetIdempotencyKey } from '@tbi/shared-utils';

const REDIS_QUEUE_URL = process.env.REDIS_QUEUE_URL || 'redis://localhost:6381/2';

function getRedisConnection() {
  try {
    const url = new URL(REDIS_QUEUE_URL);
    return new Redis({
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '6381', 10),
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname ? parseInt(url.pathname.replace('/', '') || '0', 10) : 2,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  } catch {
    return new Redis(REDIS_QUEUE_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
}

export function startCertificateWorker() {
  const redisClient = getRedisConnection();
  const workerRedis = getRedisConnection();

  const worker = new Worker(
    'certificate-queue',
    async (job) => {
      const { certificateId, studentId, studentName, eventTitle, role, idempotencyKey, requestId } = job.data;
      const effectiveKey = idempotencyKey || job.opts.jobId || `cert:${certificateId || job.id}`;

      // 1. Idempotency Check — Fail fast if already executed or locked
      try {
        const isNew = await checkAndSetIdempotencyKey(redisClient, effectiveKey, 86400);
        if (!isNew) {
          console.warn(`[CERTIFICATE_WORKER] Duplicate job skipped: key=${effectiveKey}, jobId=${job.id}, requestId=${requestId || 'N/A'}`);
          return { skipped: true, duplicate: true, jobId: job.id };
        }
      } catch (idempErr) {
        console.warn(`[CERTIFICATE_WORKER] Idempotency check warning: ${idempErr.message}`);
      }

      console.log(`[CERTIFICATE_WORKER] Generating PDF certificate ${certificateId} for ${studentName} (${eventTitle})...`);

      // 2. Heavy CPU PDF Generation (simulated/rendered buffer)
      const pdfBuffer = Buffer.from(
        `%PDF-1.4 Certificate: ${certificateId}\nRecipient: ${studentName}\nRole: ${role}\nEvent: ${eventTitle}\nGeneratedAt: ${new Date().toISOString()}`
      );

      // 3. Optional MongoDB status update if connected
      if (mongoose.connection.readyState === 1 && certificateId) {
        try {
          const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', new mongoose.Schema({}, { strict: false }));
          await Certificate.updateOne(
            { certificateId },
            { $set: { status: 'ISSUED', pdfGeneratedAt: new Date() } }
          );
        } catch (dbErr) {
          console.warn(`[CERTIFICATE_WORKER] DB update note: ${dbErr.message}`);
        }
      }

      console.log(`[CERTIFICATE_WORKER] Successfully generated PDF for certificate ${certificateId}, bytes=${pdfBuffer.length}, requestId=${requestId || 'N/A'}`);
      return { success: true, certificateId, sizeBytes: pdfBuffer.length, jobId: job.id };
    },
    {
      connection: workerRedis,
      concurrency: 2, // Heavy CPU task: strictly limited concurrency to avoid CPU starvation
    }
  );

  // 4. Failed-Jobs Path & Exponential Backoff Logging
  worker.on('failed', (job, err) => {
    const isFinalAttempt = job && job.attemptsMade >= (job.opts?.attempts || 3);
    console.error(
      `[CERTIFICATE_WORKER_FAILED] jobId=${job?.id} attempt=${job?.attemptsMade}/${job?.opts?.attempts || 3} isFinal=${isFinalAttempt} error="${err?.message}" requestId=${job?.data?.requestId || 'N/A'}`
    );
    if (isFinalAttempt) {
      console.error(
        `[CERTIFICATE_WORKER_DEAD_LETTER] Certificate generation permanently failed: jobId=${job?.id}, certificateId=${job?.data?.certificateId}, requestId=${job?.data?.requestId || 'N/A'}`
      );
    }
  });

  worker.on('error', (err) => {
    console.error('[CERTIFICATE_WORKER_ERROR]', err.message);
  });

  console.log('Certificate Generation Worker started (Limited concurrency=2, idempotency active).');
  return worker;
}
