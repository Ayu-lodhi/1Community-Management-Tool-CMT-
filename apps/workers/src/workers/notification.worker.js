import { Worker } from 'bullmq';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { checkAndSetIdempotencyKey } from '@tbi/shared-utils';

const REDIS_QUEUE_URL = process.env.REDIS_QUEUE_URL || 'redis://localhost:6381/2';

// Parse Redis Queue connection options
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

let transporter = null;
async function getTransporter() {
  if (transporter) return transporter;
  const hasRealCreds = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (hasRealCreds) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10) || 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }
  return transporter;
}

export function startNotificationWorker() {
  const redisClient = getRedisConnection();
  const workerRedis = getRedisConnection();

  const worker = new Worker(
    'email-queue',
    async (job) => {
      const { to, subject, html, text, idempotencyKey, requestId } = job.data;
      const effectiveKey = idempotencyKey || job.opts.jobId || `email:${job.id}`;

      // 1. Idempotency Check — Fail fast if already executed or locked
      try {
        const isNew = await checkAndSetIdempotencyKey(redisClient, effectiveKey, 86400);
        if (!isNew) {
          console.warn(`[NOTIFICATION_WORKER] Duplicate job skipped: key=${effectiveKey}, jobId=${job.id}, requestId=${requestId || 'N/A'}`);
          return { skipped: true, duplicate: true, jobId: job.id };
        }
      } catch (idempErr) {
        console.warn(`[NOTIFICATION_WORKER] Idempotency check warning: ${idempErr.message}`);
      }

      // 2. Perform Email Sending
      const mailer = await getTransporter();
      const info = await mailer.sendMail({
        from: process.env.EMAIL_FROM || '"TBI Platform" <noreply@tbi.org>',
        to,
        subject,
        html: html || text,
        text: text || '',
      });

      console.log(`[NOTIFICATION_WORKER] Sent email: to=${to}, subject="${subject}", jobId=${job.id}, requestId=${requestId || 'N/A'}`);
      return { success: true, messageId: info.messageId, jobId: job.id };
    },
    {
      connection: workerRedis,
      concurrency: 5, // Limited concurrency to prevent worker node exhaustion
    }
  );

  // 3. Failed-Jobs Path & Exponential Backoff Logging
  worker.on('failed', (job, err) => {
    const isFinalAttempt = job && job.attemptsMade >= (job.opts?.attempts || 3);
    console.error(
      `[NOTIFICATION_WORKER_FAILED] jobId=${job?.id} attempt=${job?.attemptsMade}/${job?.opts?.attempts || 3} isFinal=${isFinalAttempt} error="${err?.message}" requestId=${job?.data?.requestId || 'N/A'}`
    );
    if (isFinalAttempt) {
      console.error(
        `[NOTIFICATION_WORKER_DEAD_LETTER] Job permanently failed: jobId=${job?.id}, to=${job?.data?.to}, subject="${job?.data?.subject}", requestId=${job?.data?.requestId || 'N/A'}`
      );
    }
  });

  worker.on('error', (err) => {
    console.error('[NOTIFICATION_WORKER_ERROR]', err.message);
  });

  console.log('Notification Worker started (Email queue: limited concurrency=5, idempotency active).');
  return worker;
}
