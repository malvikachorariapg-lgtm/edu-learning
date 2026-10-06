// Structured logging through OpenTelemetry Logs.
// Every record carries the active trace/span ids automatically, so a log line
// links straight to its trace. Records are also printed to stdout (compact in
// development, JSON lines in production) for platform log viewers.
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { trace } = require('@opentelemetry/api');

const otelLogger = logs.getLogger('edu-learning-api');
const isProduction = process.env.NODE_ENV === 'production';
const MIN_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LEVELS = {
  debug: { n: SeverityNumber.DEBUG, text: 'DEBUG', rank: 10 },
  info: { n: SeverityNumber.INFO, text: 'INFO', rank: 20 },
  warn: { n: SeverityNumber.WARN, text: 'WARN', rank: 30 },
  error: { n: SeverityNumber.ERROR, text: 'ERROR', rank: 40 }
};

// Keys that must never be logged
const REDACT = /pass(word)?|token|secret|authorization|cookie|credential|signature|otp/i;

// OTel attributes must be primitives (or arrays of them); flatten objects with dot keys
const toAttributes = (input, prefix = '', out = {}, depth = 0) => {
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (REDACT.test(key)) {
      out[name] = '[redacted]';
    } else if (value instanceof Error) {
      out['exception.type'] = value.name;
      out['exception.message'] = value.message;
      if (value.stack) out['exception.stacktrace'] = value.stack;
    } else if (value === null || value === undefined) {
      continue;
    } else if (value instanceof Date) {
      out[name] = value.toISOString();
    } else if (Array.isArray(value)) {
      out[name] = value.slice(0, 50).map((v) => (typeof v === 'object' ? JSON.stringify(v) : v));
    } else if (typeof value === 'object') {
      if (depth < 3) toAttributes(value, name, out, depth + 1);
      else out[name] = JSON.stringify(value).slice(0, 500);
    } else if (typeof value === 'string') {
      out[name] = value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
    } else {
      out[name] = value;
    }
  }
  return out;
};

const write = (level, message, attributes = {}) => {
  const lvl = LEVELS[level] || LEVELS.info;
  if (lvl.rank < (LEVELS[MIN_LEVEL]?.rank ?? 20)) return;
  const attrs = toAttributes(attributes);

  otelLogger.emit({
    severityNumber: lvl.n,
    severityText: lvl.text,
    body: message,
    attributes: attrs
  });

  const span = trace.getActiveSpan()?.spanContext();
  const traceId = span && span.traceId !== '00000000000000000000000000000000' ? span.traceId : undefined;
  if (isProduction) {
    process.stdout.write(`${JSON.stringify({
      time: new Date().toISOString(),
      level: lvl.text,
      msg: message,
      trace_id: traceId,
      span_id: span?.spanId,
      ...attrs
    })}\n`);
  } else {
    const keys = Object.entries(attrs)
      .filter(([k]) => !k.startsWith('exception.stacktrace'))
      .slice(0, 8)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(',')}]` : v}`)
      .join(' ');
    process.stdout.write(`${lvl.text.padEnd(5)} ${message}${keys ? `  ${keys}` : ''}${traceId ? `  trace_id=${traceId}` : ''}\n`);
    if (attrs['exception.stacktrace'] && lvl.rank >= LEVELS.error.rank) {
      process.stdout.write(`${attrs['exception.stacktrace']}\n`);
    }
  }
};

const logger = {
  debug: (msg, attrs) => write('debug', msg, attrs),
  info: (msg, attrs) => write('info', msg, attrs),
  warn: (msg, attrs) => write('warn', msg, attrs),
  error: (msg, attrs) => write('error', msg, attrs)
};

/**
 * Business event, e.g. logEvent('order.created', { 'order.id': id, 'course.id': c }).
 * `event.name` makes events easy to filter in any log backend.
 */
const logEvent = (name, attributes = {}, level = 'info') =>
  write(level, name, { 'event.name': name, ...attributes });

module.exports = { logger, logEvent };
