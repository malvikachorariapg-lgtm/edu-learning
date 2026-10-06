// Browser logs via OpenTelemetry Logs. Safe to call before telemetry loads (no-op
// until the logger provider is registered in telemetry.js).
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const SEVERITY = {
  info: [SeverityNumber.INFO, 'INFO'],
  warn: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR']
};

const currentUserId = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.id;
  } catch (e) {
    return undefined;
  }
};

// Records logged before telemetry finishes loading are buffered and replayed
const pending = [];
let ready = false;

export const flushPendingLogs = () => {
  ready = true;
  pending.splice(0).forEach((record) => logs.getLogger('edu-learning-web').emit(record));
};

export const uiLog = (level, eventName, attributes = {}) => {
  const [severityNumber, severityText] = SEVERITY[level] || SEVERITY.info;
  const clean = {};
  Object.entries({
    'event.name': eventName,
    'app.route': window.location.pathname,
    'enduser.id': currentUserId(),
    'browser.viewport': `${window.innerWidth}x${window.innerHeight}`,
    'app.theme': document.documentElement.getAttribute('data-theme') || 'dark',
    ...attributes
  }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') clean[k] = typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const record = { severityNumber, severityText, body: eventName, attributes: clean, timestamp: Date.now() };
  if (!ready) {
    if (process.env.REACT_APP_OTEL_ENDPOINT && pending.length < 100) pending.push(record);
    return;
  }
  logs.getLogger('edu-learning-web').emit(record);
};
