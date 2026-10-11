const Joi = require('joi');

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(5000),
  CLIENT_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:5173'),
  MONGODB_URI: Joi.string().required(),
  REDIS_CACHE_URL: Joi.string().required(),
  REDIS_PUBSUB_URL: Joi.string().required(),
  REDIS_QUEUE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).invalid(Joi.ref('JWT_ACCESS_SECRET')).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
}).unknown(true); // Allow other optional variables like EMAIL_*, AUTO_SYNC_INDEXES, etc.

/**
 * Validates environment variables at application startup.
 * Fail-secure: If any required variable is missing or invalid, exits immediately
 * and logs ONLY variable names, never sensitive values or secrets.
 */
function validateEnvironment(env = process.env) {
  const { error, value } = envSchema.validate(env, { abortEarly: false });

  if (error) {
    const missingOrInvalidFields = error.details.map((d) => d.context?.key || d.path.join('.'));
    const uniqueFields = [...new Set(missingOrInvalidFields)];

    // Strictly names only, never secrets or values (Rule B.4 / Phase 4.1)
    console.error(
      `FATAL CONFIG ERROR: Startup environment validation failed. Missing or invalid variables: ${uniqueFields.join(', ')}`
    );
    process.exit(1);
  }

  return value;
}

module.exports = {
  validateEnvironment,
  envSchema,
};
