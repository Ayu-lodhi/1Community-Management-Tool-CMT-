/**
 * Idempotency Utility
 * Ensures that background workers, webhooks, and retryable jobs do not perform duplicate operations.
 */
export async function checkAndSetIdempotencyKey(redisClient, key, ttlSeconds = 86400) {
  if (!redisClient) {
    throw new Error('Redis client required for idempotency check');
  }
  // SET key value NX EX ttl
  const result = await redisClient.set(`idempotency:${key}`, 'LOCKED', 'NX', 'EX', ttlSeconds);
  return result === 'OK';
}

export async function releaseIdempotencyKey(redisClient, key) {
  if (!redisClient) return;
  await redisClient.del(`idempotency:${key}`);
}
