import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
reportWebVitals();

// Tracing loads after the page is interactive so it never slows first paint
if (process.env.REACT_APP_OTEL_ENDPOINT) {
  const loadTelemetry = () => import('./telemetry').then((m) => m.startTelemetry()).catch(() => {});
  if (document.readyState === 'complete') loadTelemetry();
  else window.addEventListener('load', loadTelemetry, { once: true });
}
