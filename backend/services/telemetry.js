// App-level tracing and metrics on top of the auto-instrumentation.
// Uses only @opentelemetry/api, so every call is a cheap no-op when the SDK is off.
const { trace, metrics, SpanStatusCode, context } = require('@opentelemetry/api');

const tracer = trace.getTracer('edu-learning');
const meter = metrics.getMeter('edu-learning');

// Business metrics
const counters = {
  signIns: meter.createCounter('edu.auth.sign_ins', { description: 'Successful sign-ins' }),
  signInFailures: meter.createCounter('edu.auth.sign_in_failures', { description: 'Rejected sign-in attempts' }),
  ordersCreated: meter.createCounter('edu.payments.orders_created', { description: 'Checkout orders created' }),
  enrollments: meter.createCounter('edu.enrollments', { description: 'Completed enrollments' }),
  summaries: meter.createCounter('edu.ai.summaries', { description: 'AI summary requests by cache result' })
};
const histograms = {
  aiLatency: meter.createHistogram('edu.ai.summary.duration', {
    description: 'Time to produce an AI summary (cache misses only)',
    unit: 'ms'
  })
};

/**
 * Run `fn` inside a span. Records exceptions and sets error status on throw.
 * fn receives the span so it can add attributes.
 */
const withSpan = (name, attributes, fn) =>
  tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });

// Trace id of the current request (for logs / support tickets)
const currentTraceId = () => {
  const span = trace.getSpan(context.active());
  const id = span?.spanContext().traceId;
  return id && id !== '00000000000000000000000000000000' ? id : null;
};

// Express middleware: expose the trace id so a user-reported error can be found in Jaeger
const traceIdHeader = (req, res, next) => {
  const id = currentTraceId();
  if (id) res.setHeader('x-trace-id', id);
  next();
};

module.exports = { tracer, withSpan, counters, histograms, currentTraceId, traceIdHeader };
