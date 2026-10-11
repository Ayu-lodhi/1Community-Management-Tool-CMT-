const crypto = require('crypto');
const { Queue } = require('bullmq');
const { logger } = require('../utils/logger');

// Redis Queue connection URL (Redis Instance 3 - Queue)
const REDIS_QUEUE_URL = process.env.REDIS_QUEUE_URL || 'redis://localhost:6381/2';

// Parse connection options for BullMQ
let connectionOpts;
try {
  const url = new URL(REDIS_QUEUE_URL);
  connectionOpts = {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6381', 10),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? parseInt(url.pathname.replace('/', '') || '0', 10) : 2,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (process.env.NODE_ENV === 'test' || times > 3) return null;
      return Math.min(times * 200, 3000);
    },
  };
} catch {
  connectionOpts = {
    host: 'localhost',
    port: 6381,
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (process.env.NODE_ENV === 'test' || times > 3) return null;
      return Math.min(times * 200, 3000);
    },
  };
}

// Queue options with standard BullMQ idempotency and retry configuration
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

let emailQueue = null;
let certificateQueue = null;

try {
  emailQueue = new Queue('email-queue', {
    connection: connectionOpts,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  certificateQueue = new Queue('certificate-queue', {
    connection: connectionOpts,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  emailQueue.on('error', (err) => {
    logger.warn('Email Queue connection error (will retry or fallback)', { error: err.message });
  });

  certificateQueue.on('error', (err) => {
    logger.warn('Certificate Queue connection error (will retry or fallback)', { error: err.message });
  });
} catch (err) {
  logger.error('Failed to initialize BullMQ queues', { error: err.message });
}

const maskEmail = (email) => {
  if (typeof email !== 'string' || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
};

/**
 * Enqueue an email job with idempotency key, retries with exponential backoff,
 * and request ID tracing.
 */
async function enqueueEmail(jobName, payload, options = {}) {
  try {
    if (!emailQueue) {
      throw new Error('Email queue is not initialized');
    }

    // Generate unique idempotency key if not explicitly provided
    const idempotencyPayload = JSON.stringify({
      to: payload.to,
      subject: payload.subject,
      type: payload.type || jobName,
      // 5-minute bucket ensures retrying the exact request deduplicates, while future ones succeed
      bucket: Math.floor(Date.now() / 300000),
    });
    const hash = crypto.createHash('sha256').update(idempotencyPayload).digest('hex').slice(0, 16);
    const jobId = options.jobId || options.idempotencyKey || `email:${payload.type || jobName}:${hash}`;

    const jobData = {
      ...payload,
      idempotencyKey: jobId,
      enqueuedAt: new Date().toISOString(),
      requestId: payload.requestId || options.requestId || null,
    };

    const jobOpts = {
      ...DEFAULT_JOB_OPTIONS,
      jobId,
      ...options,
    };

    const job = await emailQueue.add(jobName, jobData, jobOpts);
    logger.info('Email job enqueued to BullMQ worker', {
      jobId: job.id,
      name: jobName,
      to: maskEmail(payload.to),
      requestId: jobData.requestId,
    });

    return { enqueued: true, jobId: job.id };
  } catch (err) {
    logger.warn('BullMQ email enqueue failed, falling back', {
      error: err.message,
      jobName,
      to: maskEmail(payload?.to),
      requestId: payload?.requestId,
    });
    return { enqueued: false, error: err.message };
  }
}

/**
 * Enqueue a certificate generation job with idempotency key, retries with exponential backoff,
 * and request ID tracing.
 */
async function enqueueCertificateGeneration(payload, options = {}) {
  try {
    if (!certificateQueue) {
      throw new Error('Certificate queue is not initialized');
    }

    const jobId = options.jobId || options.idempotencyKey || `cert:${payload.certificateId || payload.studentId + '-' + payload.eventId}`;

    const jobData = {
      ...payload,
      idempotencyKey: jobId,
      enqueuedAt: new Date().toISOString(),
      requestId: payload.requestId || options.requestId || null,
    };

    const jobOpts = {
      ...DEFAULT_JOB_OPTIONS,
      jobId,
      ...options,
    };

    const job = await certificateQueue.add('generateCertificate', jobData, jobOpts);
    logger.info('Certificate generation job enqueued to BullMQ worker', {
      jobId: job.id,
      certificateId: payload.certificateId,
      requestId: jobData.requestId,
    });

    return { enqueued: true, jobId: job.id };
  } catch (err) {
    logger.warn('BullMQ certificate enqueue failed', {
      error: err.message,
      certificateId: payload?.certificateId,
      requestId: payload?.requestId,
    });
    return { enqueued: false, error: err.message };
  }
}

async function closeQueues() {
  const closers = [];
  if (emailQueue) closers.push(emailQueue.close());
  if (certificateQueue) closers.push(certificateQueue.close());
  await Promise.allSettled(closers);
}

module.exports = {
  emailQueue,
  certificateQueue,
  enqueueEmail,
  enqueueCertificateGeneration,
  DEFAULT_JOB_OPTIONS,
  closeQueues,
};
