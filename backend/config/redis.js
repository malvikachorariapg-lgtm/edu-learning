// Redis Cache Configuration
// Supports REDIS_URL (e.g. Render Key Value / Upstash, rediss:// for TLS) or REDIS_HOST/PORT/PASSWORD.
const Redis = require('ioredis');

const isDev = process.env.NODE_ENV !== 'production';

const baseOptions = {
  // Keep reconnecting in the background (capped backoff) so a Redis blip doesn't
  // permanently disable caching/rate limiting for the life of the process.
  retryStrategy: (times) => Math.min(times * 200, 5000),
  maxRetriesPerRequest: 1,
  // Fail fast instead of queueing commands while disconnected - callers fall back to no-cache.
  enableOfflineQueue: false,
  connectTimeout: 5000,
  lazyConnect: true
};

const REDIS_CONFIG = process.env.REDIS_URL
  ? null
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    };

let redisClient = null;
let isRedisAvailable = false;
let warnedUnavailable = false;

// Initialize Redis Connection (resolves within ~5s even if Redis is down)
const connectRedis = async () => {
  try {
    redisClient = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, baseOptions)
      : new Redis({ ...REDIS_CONFIG, ...baseOptions });

    redisClient.on('ready', () => {
      if (!isRedisAvailable) console.log('✅ Redis Connected Successfully');
      isRedisAvailable = true;
      warnedUnavailable = false;
    });

    redisClient.on('error', (err) => {
      isRedisAvailable = false;
      if (!warnedUnavailable) {
        console.warn('⚠️  Redis unavailable (' + (err.code || err.message) + '). Running without cache; will keep retrying.');
        warnedUnavailable = true;
      }
    });

    redisClient.on('close', () => {
      isRedisAvailable = false;
    });

    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timeout')), 5000))
    ]).catch(() => {
      isRedisAvailable = false;
    });

    return redisClient;
  } catch (error) {
    console.log('⚠️  Redis initialization failed. Running without cache.');
    isRedisAvailable = false;
    return null;
  }
};

// Get Redis Client (null when not connected)
const getRedisClient = () => {
  return isRedisAvailable ? redisClient : null;
};

const getRedisStatus = () => {
  if (!redisClient) return 'disabled';
  return isRedisAvailable ? 'connected' : redisClient.status;
};

const disconnectRedis = async () => {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch (e) {
    redisClient.disconnect();
  }
};

// Cache Middleware - caches successful JSON GET responses by URL
const cacheMiddleware = (duration = 1800) => {
  return async (req, res, next) => {
    if (!isRedisAvailable || !redisClient) return next();

    const key = `cache:${req.originalUrl}`;

    try {
      const cachedData = await redisClient.get(key);

      if (cachedData) {
        if (isDev) console.log(`✅ Cache HIT for: ${key}`);
        // Send the stored JSON string as-is (no parse/stringify round trip)
        res.set('X-Cache', 'HIT');
        res.type('application/json');
        return res.send(cachedData);
      }

      if (isDev) console.log(`❌ Cache MISS for: ${key}`);
      res.set('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = function(data) {
        if (data && data.success && res.statusCode === 200 && isRedisAvailable) {
          redisClient.setex(key, duration, JSON.stringify(data))
            .catch(err => console.log('Cache set error:', err.message));
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      if (isDev) console.log('Cache middleware error:', error.message);
      next();
    }
  };
};

// Clear Cache by Pattern (uses SCAN, never blocks Redis like KEYS does)
const clearCache = async (pattern = '*') => {
  try {
    if (!isRedisAvailable || !redisClient) return;

    let cursor = '0';
    let cleared = 0;
    do {
      const [next, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        cleared += await redisClient.del(...keys);
      }
    } while (cursor !== '0');

    if (cleared > 0) console.log(`🗑️ Cleared ${cleared} cache entries (${pattern})`);
  } catch (error) {
    console.log('Error clearing cache:', error.message);
  }
};

// Invalidate public course caches (call after any course/lesson/document change)
const invalidateCourseCache = () => clearCache('cache:/api/courses*');

module.exports = {
  connectRedis,
  getRedisClient,
  getRedisStatus,
  disconnectRedis,
  cacheMiddleware,
  clearCache,
  invalidateCourseCache
};
