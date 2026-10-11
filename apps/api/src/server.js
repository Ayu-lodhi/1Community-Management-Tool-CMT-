const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const { validateEnvironment } = require('./core/config/envValidation');
if (process.env.NODE_ENV !== 'test') {
  validateEnvironment();
}

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const securityMiddleware = require('./middleware/security.middleware');
const { requestIdMiddleware } = require('./middleware/requestId.middleware');
const { globalLimiter, createUserLimiter } = require('./middleware/rateLimit.middleware');
const { initSocket } = require('./config/socket');
const compression = require('compression');
const { noCache, publicCache } = require('./middleware/cacheControl.middleware');
const { queueBoardRouter } = require('./core/queues/queueBoard');
const { closeQueues } = require('./core/queues/queue.service');
const { protect, restrictTo } = require('./modules/auth/auth.middleware');

const app = express();

const trustProxyConfig = process.env.TRUST_PROXY || false;
// Parse to number if it's a digit string, else keep as string (e.g. 'loopback') or boolean
app.set('trust proxy', /^\d+$/.test(trustProxyConfig) ? parseInt(trustProxyConfig, 10) : (trustProxyConfig === 'true' ? true : (trustProxyConfig === 'false' ? false : trustProxyConfig)));


const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (process.env.ALLOWED_ORIGINS) {
    const list = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (list.includes(origin)) return true;
  }
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed for origin: ' + origin));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(securityMiddleware);
app.use(requestIdMiddleware);
app.use(globalLimiter);

// Health check endpoint (public, returns ok/not-ok component statuses only)
app.use('/health', require('./modules/health/health.routes'));
app.use('/api/v1/health', require('./modules/health/health.routes'));

// Queue dashboard (protected behind admin authentication only)
app.use('/admin/queues', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), queueBoardRouter);

// Enforce no-cache by default across all authenticated and API routes
app.use('/api', noCache);

app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/admin', require('./modules/admin/admin.routes'));
app.use('/api/v1/events', require('./modules/events/events.routes'));
app.use('/api/v1/applications', require('./modules/applications/applications.routes'));
app.use('/api/v1/teams', require('./modules/teams/teams.routes'));
app.use('/api/v1/attendance', require('./modules/attendance/attendance.routes'));
app.use('/api/v1/reviews', require('./modules/reviews/reviews.routes'));
app.use('/api/v1/notifications', require('./modules/notifications/notifications.routes'));
app.use('/api/v1/certificates', require('./modules/certificates/certificates.routes'));
app.use('/api/v1/chat', require('./modules/chat/chat.routes'));
app.use('/api/v1/super-admin', require('./modules/super-admin/superAdmin.routes'));
app.use('/api/v1/stats', require('./modules/stats/stats.routes'));
app.use('/api/v1/preferences', require('./modules/users/preferences.routes'));
app.use('/api/v1/announcements', require('./modules/announcements/announcements.routes'));
app.use('/api/v1/timesheets', require('./modules/timesheets/timesheets.routes'));
app.use('/api/v1/profile', require('./modules/profile/profile.routes'));
app.patch('/api/v1/admin/users/:userId/tier', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), createUserLimiter, require('./modules/profile/profile.controller').updateUserTier);

app.get('/', publicCache(120), (req, res) => {
  res.json({
    message: 'TBI API running',
    version: '3.0.0',
    realtime: 'socket.io enabled',
  });
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const requestId = req?.id || req?.headers?.['x-request-id'] || null;
  console.error('Server error:', {
    message: err.message,
    status,
    requestId,
    stack: isProd ? undefined : err.stack,
  });
  const message = isProd && status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, message });
});

console.log('Connecting to MongoDB...');
const MONGODB_URI = process.env.MONGODB_URI;
if (mongoose.connection.readyState === 0 && MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(async () => {
      console.log('MongoDB Connected');
      if (process.env.AUTO_SYNC_INDEXES === 'true') {
        try {
          const Attendance = require('./modules/attendance/attendance.model');
          const AttendanceLink = require('./modules/attendance/attendanceLink.model');
          await Attendance.syncIndexes();
          await AttendanceLink.syncIndexes();
          console.log('Attendance & AttendanceLink indexes synced');
        } catch (idxErr) {
          console.warn('Index sync warning:', idxErr.message);
        }
      }
    })
    .catch((err) => console.error('MongoDB Error:', err.message));
}

const server = http.createServer(app);
initSocket(server);
console.log('Socket.io initialized');

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// Graceful shutdown handling on SIGTERM and SIGINT
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Initiating graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP server closed to new connections.');
    try {
      await closeQueues();
      console.log('BullMQ queues closed.');
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log('MongoDB connection closed.');
      }
      console.log('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (shutdownErr) {
      console.error('Error during graceful shutdown:', shutdownErr);
      process.exit(1);
    }
  });

  // Force shutdown if cleanup takes longer than specified timeout
  const timeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10000;
  setTimeout(() => {
    console.error(`Graceful shutdown timed out (${timeoutMs}ms), forcing exit.`);
    process.exit(1);
  }, timeoutMs).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;