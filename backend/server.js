// Telemetry must load before express/mongoose/ioredis so they get instrumented
const { shutdownTelemetry } = require('./instrumentation');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const { connectRedis, disconnectRedis, getRedisStatus } = require('./config/redis');
const { traceIdHeader } = require('./services/telemetry');
const requestLogger = require('./middleware/requestLogger');

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;
const VERSION = '1.1.0';

// Fail fast on missing critical configuration in production
if (isProduction && !process.env.MONGO_URI) {
  console.error('❌ MONGO_URI is required');
  process.exit(1);
}
require('./middleware/auth'); // throws if JWT_SECRET is missing in production

// CORS allowlist: FRONTEND_URL (comma separated) + localhost in development
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && localhostPattern.test(origin)) return callback(null, true);
    // Not allowed: respond without CORS headers (browser blocks it)
    return callback(null, false);
  },
  credentials: true,
  // Browser tracing sends W3C trace context; the trace id comes back for support/debugging
  allowedHeaders: ['Content-Type', 'Authorization', 'traceparent', 'tracestate'],
  exposedHeaders: ['x-trace-id', 'x-request-id'],
  maxAge: 86400
};

const createApp = () => {
  // Required after Redis is connected so limiters can use the Redis store
  const { apiLimiter, usingRedis } = require('./middleware/rateLimiters');

  const app = express();

  // Running behind Render / a load balancer: trust the first proxy hop for req.ip
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
  app.disable('x-powered-by');

  // Security middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(compression());
  app.use(cors(corsOptions));
  app.use(traceIdHeader);
  app.use(requestLogger);

  // Body parsers with size limits
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Health check route (not rate limited) - reports DB/Redis status
  app.get('/api/health', (req, res) => {
    const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const db = dbStates[mongoose.connection.readyState] || 'unknown';
    const redis = getRedisStatus();
    const healthy = db === 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? (redis === 'connected' ? 'ok' : 'degraded') : 'error',
      message: 'Edu Learning LMS API is running',
      timestamp: new Date().toISOString(),
      version: VERSION,
      db,
      redis,
      uptime: Math.round(process.uptime()),
      pid: process.pid
    });
  });

  // General API rate limiting (auth + AI endpoints have their own stricter limits)
  app.use('/api/', apiLimiter);
  if (!isProduction) console.log(` Rate limit store: ${usingRedis ? 'redis' : 'memory'}`);

  // Static files
  const staticOpts = { maxAge: isProduction ? '1d' : 0, index: false };
  app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOpts));
  app.use('/videos', express.static(path.join(__dirname, 'public/videos'), staticOpts));
  app.use('/public', express.static(path.join(__dirname, 'public'), staticOpts));

  // Routes
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/courses', require('./routes/courseRoutes'));
  app.use('/api/payment', require('./routes/paymentRoutes'));
  app.use('/api/admin', require('./routes/adminRoutes'));
  app.use('/api/wishlist', require('./routes/wishlistRoutes'));
  app.use('/api/reviews', require('./routes/reviewRoutes'));
  app.use('/api/coupons', require('./routes/couponRoutes'));
  app.use('/api/orders', require('./routes/orderRoutes'));
  app.use('/api/quizzes', require('./routes/quizRoutes'));
  app.use('/api/certificates', require('./routes/certificateRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/support', require('./routes/supportRoutes'));
  app.use('/api/newsletter', require('./routes/newsletterRoutes'));
  app.use('/api/mentors', require('./routes/mentorRoutes'));
  app.use('/api/events', require('./routes/eventRoutes'));

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  });

  // Error Handler
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('Error:', err);
    res.status(status).json({
      success: false,
      message: status >= 500 && isProduction ? 'Internal Server Error' : (err.message || 'Internal Server Error')
    });
  });

  return app;
};

let server = null;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(` ${signal} received (pid ${process.pid}), shutting down gracefully...`);

  // Force exit if connections don't drain in time
  setTimeout(() => {
    console.error(' Forced shutdown after timeout');
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000).unref();

  try {
    if (server) {
      await new Promise(resolve => server.close(resolve));
      if (server.closeIdleConnections) server.closeIdleConnections();
    }
    await mongoose.connection.close();
    await disconnectRedis();
    await shutdownTelemetry();
    console.log(' Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error(' Error during shutdown:', err);
    process.exit(1);
  }
};

const start = async () => {
  // Redis first (optional) so rate limiters can share state across workers
  await connectRedis();

  // MongoDB Connection
  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 50,
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log('✅ MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  }

  const app = createApp();

  server = app.listen(PORT, () => {
    console.log(` Server running on port ${PORT} (pid ${process.pid})`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 120000;
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

start();
