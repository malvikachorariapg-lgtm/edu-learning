// One structured log record per API request (OpenTelemetry semantic attribute names).
// 5xx → ERROR, 4xx → WARN, everything else → INFO. Error responses include the
// message sent to the client, so a failing toast in the UI can be found by its text.
const crypto = require('crypto');
const { logger } = require('../services/logger');
const { getUserFromRequest } = require('./auth');

const SKIP = ['/api/health'];

const requestLogger = (req, res, next) => {
  if (SKIP.includes(req.path)) return next();

  const started = process.hrtime.bigint();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);

  // Capture the error message we send back (without logging bodies of successful calls)
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === 'object') {
      res.locals.errorMessage = body.message;
      res.locals.errorCode = body.code;
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path;
    const status = res.statusCode;
    const user = getUserFromRequest(req);
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${route} ${status} ${durationMs.toFixed(1)}ms`, {
      'event.name': 'http.request',
      'http.request.method': req.method,
      'http.route': route,
      'url.path': req.path,
      'url.query': Object.keys(req.query || {}).length ? JSON.stringify(req.query).slice(0, 300) : undefined,
      'http.response.status_code': status,
      'http.server.request.duration_ms': Math.round(durationMs * 10) / 10,
      'http.response.body.size': Number(res.getHeader('content-length')) || undefined,
      'http.request.id': requestId,
      'client.address': req.ip,
      'user_agent.original': req.headers['user-agent'],
      'enduser.id': user?.id,
      'enduser.role': user?.role,
      'error.message': res.locals.errorMessage,
      'error.code': res.locals.errorCode,
      'edu.cache': res.getHeader('x-summary-cache') || undefined
    });
  });

  next();
};

module.exports = requestLogger;
