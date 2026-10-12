import { ApiError } from '../errors/ApiError.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  // Log error using structured Winston logger
  logger.error(error.message, {
    statusCode: error.statusCode,
    url: req.originalUrl,
    method: req.method,
    stack: error.stack
  });

  const response = {
    success: false,
    message: error.message,
    statusCode: error.statusCode,
    ...(error.errors?.length && { errors: error.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };

  return res.status(error.statusCode).json(response);
}
