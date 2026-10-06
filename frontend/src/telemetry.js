// Browser OpenTelemetry: page-load timing + API calls, joined to backend traces
// through W3C trace context (traceparent). Loaded lazily from index.js after the
// first paint so it never competes with rendering, and only when
// REACT_APP_OTEL_ENDPOINT is set.
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { uiLog, flushPendingLogs } from './services/uiLog';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tags every span with the current route and the signed-in learner's id (no PII)
class AppContextProcessor {
  onStart(span) {
    span.setAttribute('app.route', window.location.pathname);
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (user?.id) span.setAttribute('enduser.id', String(user.id));
    } catch (e) { /* ignore */ }
  }
  onEnd() {}
  shutdown() { return Promise.resolve(); }
  forceFlush() { return Promise.resolve(); }
}

let started = false;

export const startTelemetry = () => {
  const endpoint = process.env.REACT_APP_OTEL_ENDPOINT;
  if (started || !endpoint) return;
  started = true;

  const apiOrigin = new URL(process.env.REACT_APP_API_URL || 'http://localhost:5001/api').origin;
  const ratio = Number(process.env.REACT_APP_OTEL_SAMPLE_RATE ?? 1);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.REACT_APP_OTEL_SERVICE_NAME || 'edu-learning-web',
    [ATTR_SERVICE_VERSION]: process.env.REACT_APP_VERSION || '2.0.1',
    'deployment.environment.name': process.env.NODE_ENV
  });

  // Logs: every session that loads telemetry ships its UI logs (not sampled)
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/logs` }),
        scheduledDelayMillis: 3000
      })
    ]
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  flushPendingLogs();

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.REACT_APP_OTEL_SERVICE_NAME || 'edu-learning-web',
      [ATTR_SERVICE_VERSION]: process.env.REACT_APP_VERSION || '2.0.1',
      'deployment.environment.name': process.env.NODE_ENV
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) }),
    spanProcessors: [
      new AppContextProcessor(),
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }), {
        scheduledDelayMillis: 3000
      })
    ]
  });
  provider.register({ contextManager: new ZoneContextManager() });

  // Only our API gets trace headers; third parties (Firebase, YouTube, Razorpay) don't
  const propagateTo = [new RegExp(`^${escapeRe(apiOrigin)}`)];
  const ignore = [new RegExp(`^${escapeRe(endpoint)}`), /googleapis\.com/, /youtube\.com/, /razorpay\.com/, /gstatic\.com/];

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new XMLHttpRequestInstrumentation({ propagateTraceHeaderCorsUrls: propagateTo, ignoreUrls: ignore }),
      new FetchInstrumentation({ propagateTraceHeaderCorsUrls: propagateTo, ignoreUrls: ignore })
    ]
  });

  // Uncaught errors and promise rejections become error spans
  const tracer = provider.getTracer('edu-learning-web');
  const recordException = (err, kind) => {
    const span = tracer.startSpan('ui.exception', { attributes: { 'exception.kind': kind } });
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus({ code: 2, message: err?.message || String(err) });
    span.end();
  };
  window.addEventListener('error', (e) => {
    recordException(e.error || e.message, 'error');
    uiLog('error', 'ui.exception', {
      'exception.message': e.error?.message || e.message,
      'exception.stacktrace': e.error?.stack,
      'code.filepath': e.filename,
      'code.lineno': e.lineno
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    // API failures are already recorded by the axios interceptor
    if (e.reason?.isAxiosError) return;
    recordException(e.reason, 'unhandledrejection');
    uiLog('error', 'ui.unhandled_rejection', {
      'exception.message': e.reason?.message || String(e.reason),
      'exception.stacktrace': e.reason?.stack
    });
  });
  uiLog('info', 'ui.session_start', {
    'user_agent.original': navigator.userAgent,
    'browser.language': navigator.language,
    'app.referrer': document.referrer
  });

  // Flush what we have when the tab is hidden/closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      provider.forceFlush().catch(() => {});
      loggerProvider.forceFlush().catch(() => {});
    }
  });
};
