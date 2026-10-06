// Rate limiters
// Uses a Redis store (shared across cluster workers / instances) when Redis is connected
// at startup, otherwise an in-memory store per process. Requires connectRedis() to have
// been awaited before this module is first required (server.js does this).
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');
const { getUserFromRequest } = require('./auth');

const num = (name, fallback) => Number(process.env[name]) || fallback;

const makeStore = (prefix) => {
  const client = getRedisClient();
  if (!client) return undefined; // express-rate-limit default MemoryStore
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (command, ...args) => client.call(command, ...args)
  });
};

const tooMany = (message) => ({ success: false, message });

const baseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // If Redis goes away mid-flight, let requests through rather than failing them
  passOnStoreError: true
};

const ipKey = (req) => ipKeyGenerator(req.ip);

// General API limiter: keyed per authenticated user when a valid JWT is present,
// otherwise per IP. The per-IP allowance is generous because a whole campus can sit
// behind one NAT address.
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: (req) => (req.rateLimitUser ? num('RATE_LIMIT_USER_PER_MIN', 300) : num('RATE_LIMIT_IP_PER_MIN', 3000)),
  keyGenerator: (req) => {
    const user = getUserFromRequest(req);
    req.rateLimitUser = user ? user.id : null;
    return user ? `u:${user.id}` : `ip:${ipKey(req)}`;
  },
  skip: (req) => req.path === '/health',
  message: tooMany('Too many requests, please slow down and try again shortly.'),
  store: makeStore('api')
});

// Auth limiter (login/register): brute-force protection per IP+email.
// Only failed attempts count, so a class logging in together is not blocked.
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: num('RATE_LIMIT_AUTH_PER_15MIN', 10),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String((req.body && req.body.email) || '').toLowerCase().trim().slice(0, 200);
    return `${ipKey(req)}:${email}`;
  },
  message: tooMany('Too many failed attempts for this account. Please try again in 15 minutes.'),
  store: makeStore('auth')
});

// Coarser per-IP cap on auth endpoints (credential stuffing across many emails)
const authIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: num('RATE_LIMIT_AUTH_IP_PER_15MIN', 1000),
  keyGenerator: ipKey,
  message: tooMany('Too many authentication requests from this network. Please try again later.'),
  store: makeStore('authip')
});

// AI summarization limiter: per user (route must run verifyToken first)
const aiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: num('RATE_LIMIT_AI_PER_10MIN', 20),
  keyGenerator: (req) => (req.user && req.user.id ? `u:${req.user.id}` : `ip:${ipKey(req)}`),
  message: tooMany('You have requested too many summaries. Please wait a few minutes and try again.'),
  store: makeStore('ai')
});

const usingRedis = !!getRedisClient();

module.exports = {
  apiLimiter,
  authLimiter,
  authIpLimiter,
  aiLimiter,
  usingRedis
};
