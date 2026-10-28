import { Worker } from 'bullmq';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { checkAndSetIdempotencyKey } from '@tbi/shared-utils';

const REDIS_QUEUE_URL = process.env.REDIS_QUEUE_URL || 'redis://localhost:6381/2';

function deriveSesSmtpPassword(secretKey, region = 'ap-south-1') {
  const DATE = '11111111';
  const SERVICE = 'ses';
  const MESSAGE = 'SendRawEmail';
  const TERMINAL = 'aws4_request';
  const VERSION = Buffer.from([0x04]);

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

  const kDate = hmac('AWS4' + secretKey, DATE);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, TERMINAL);
  const signature = hmac(kSigning, MESSAGE);

  return Buffer.concat([VERSION, signature]).toString('base64');
}

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
  const region = process.env.AWS_REGION || 'ap-south-1';
  const host = process.env.EMAIL_HOST || (process.env.AWS_REGION ? `email-smtp.${region}.amazonaws.com` : null);
  const user = process.env.EMAIL_USER || process.env.AWS_ACCESS_KEY_ID;
  const rawPass = process.env.EMAIL_PASS || process.env.AWS_SECRET_ACCESS_KEY;

  const hasRealCreds = host && user && rawPass;
  if (hasRealCreds) {
    let smtpPass = rawPass;
    if (smtpPass && smtpPass.length === 40 && !smtpPass.startsWith('B')) {
      smtpPass = deriveSesSmtpPassword(smtpPass, region);
    }
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.EMAIL_PORT, 10) || 587,
      secure: false,
      requireTLS: true,
      auth: {
        user,
        pass: smtpPass,
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
      const fromAddress = process.env.EMAIL_FROM || (process.env.SES_FROM_NAME && process.env.SES_FROM_EMAIL
        ? `"${process.env.SES_FROM_NAME}" <${process.env.SES_FROM_EMAIL}>`
        : process.env.SES_FROM_EMAIL || '"TBI Platform" <noreply@tbi.org>');

      const mailHeaders = {};
      if (process.env.SES_CONFIGURATION_SET) {
        mailHeaders['X-SES-CONFIGURATION-SET'] = process.env.SES_CONFIGURATION_SET;
      }

      const mailer = await getTransporter();
      const info = await mailer.sendMail({
        from: fromAddress,
        to,
        subject,
        html: html || text,
        text: text || '',
        headers: Object.keys(mailHeaders).length > 0 ? mailHeaders : undefined,
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
