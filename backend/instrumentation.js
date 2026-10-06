// OpenTelemetry bootstrap. Must be required before anything else (first line of
// server.js) so auto-instrumentation can patch http, express, mongodb, ioredis
// and outbound fetch/undici (Gemini, Razorpay) as they load.
//
// Configured with the standard OTEL_* env vars. Telemetry is off unless
// OTEL_EXPORTER_OTLP_ENDPOINT is set, so local runs without a collector stay quiet.
require('dotenv').config();

const enabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) && process.env.OTEL_SDK_DISABLED !== 'true';

let sdk = null;

if (enabled) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

  const IGNORED_PATHS = ['/api/health', '/favicon.ico'];

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'edu-learning-api',
      [ATTR_SERVICE_VERSION]: require('./package.json').version,
      'deployment.environment.name': process.env.NODE_ENV || 'development'
    }),
    traceExporter: new OTLPTraceExporter(),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(), scheduledDelayMillis: 2000 })],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 30000
      })
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Too noisy / low value for this app
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => IGNORED_PATHS.some((p) => req.url?.startsWith(p)),
          // Collector exports are themselves HTTP calls — don't trace them
          ignoreOutgoingRequestHook: (opts) => String(opts.path || '').startsWith('/v1/')
        },
        '@opentelemetry/instrumentation-mongodb': { enhancedDatabaseReporting: false },
        '@opentelemetry/instrumentation-ioredis': { requireParentSpan: true }
      })
    ]
  });

  sdk.start();

  // Console bridge: every console.* line is also exported as an OTel log record
  // (with trace/span ids when inside a request), so nothing printed is lost.
  const util = require('util');
  const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
  const { trace } = require('@opentelemetry/api');
  const consoleLogger = logs.getLogger('console');
  const severities = {
    log: [SeverityNumber.INFO, 'INFO'],
    info: [SeverityNumber.INFO, 'INFO'],
    warn: [SeverityNumber.WARN, 'WARN'],
    error: [SeverityNumber.ERROR, 'ERROR']
  };
  for (const [level, [severityNumber, severityText]] of Object.entries(severities)) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const err = args.find((a) => a instanceof Error);
      const attributes = { 'log.source': 'console' };
      if (err) {
        attributes['exception.type'] = err.name;
        attributes['exception.message'] = err.message;
        if (err.stack) attributes['exception.stacktrace'] = err.stack;
      }
      consoleLogger.emit({ severityNumber, severityText, body: util.format(...args), attributes });
      const ctx = trace.getActiveSpan()?.spanContext();
      if ((level === 'error' || level === 'warn') && ctx && ctx.traceId !== '00000000000000000000000000000000') {
        original(...args, `trace_id=${ctx.traceId}`);
      } else {
        original(...args);
      }
    };
  }
  console.log(` OpenTelemetry on → ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT} (pid ${process.pid})`);
}

// Flush pending spans/metrics; called from the server's graceful shutdown
const shutdownTelemetry = async () => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error(' OpenTelemetry shutdown error:', err.message);
  }
};

module.exports = { telemetryEnabled: enabled, shutdownTelemetry };
