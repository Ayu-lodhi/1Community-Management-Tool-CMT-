/**
 * Idempotency Utility (CommonJS entrypoint)
 */
async function checkAndSetIdempotencyKey(redisClient, key, ttlSeconds = 86400) {
  if (!redisClient) {
    throw new Error('Redis client required for idempotency check');
  }
  const result = await redisClient.set(`idempotency:${key}`, 'LOCKED', 'NX', 'EX', ttlSeconds);
  return result === 'OK';
}

async function releaseIdempotencyKey(redisClient, key) {
  if (!redisClient) return;
  await redisClient.del(`idempotency:${key}`);
}

module.exports = {
  checkAndSetIdempotencyKey,
  releaseIdempotencyKey,
};
