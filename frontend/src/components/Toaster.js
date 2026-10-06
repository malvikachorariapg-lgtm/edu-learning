import React, { useEffect, useState } from 'react';

// Global toasts. Anything (React or not, e.g. the axios interceptor) can raise one:
//   toast.success('Saved')   toast.error('Could not save', { status: 500, traceId })
const EVENT = 'edu-toast';
let nextId = 1;

const emit = (type, message, meta = {}) => {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: nextId++, type, message, ...meta } }));
};

export const toast = {
  success: (message, meta) => emit('success', message, meta),
  error: (message, meta) => emit('error', message, meta),
  info: (message, meta) => emit('info', message, meta)
};

const LIFETIME = { success: 3500, info: 4500, error: 7000 };
const MAX_VISIBLE = 4;

const Toaster = () => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((list) => {
        // Collapse identical toasts fired in quick succession
        if (list.some((x) => x.message === t.message && x.type === t.type)) return list;
        return [...list, t].slice(-MAX_VISIBLE);
      });
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), LIFETIME[t.type] || 4000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  const dismiss = (id) => setItems((list) => list.filter((x) => x.id !== id));

  return (
    <div className="edu-toasts" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`edu-toast edu-toast--${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          <span className="edu-toast__icon" aria-hidden="true">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}
          </span>
          <div className="edu-toast__body">
            <p className="edu-toast__msg">{t.message}</p>
            {(t.status || t.traceId) && (
              <p className="edu-toast__meta">
                {t.status ? `Error ${t.status}` : ''}
                {t.status && t.traceId ? ' · ' : ''}
                {t.traceId ? `Ref ${t.traceId.slice(0, 12)}` : ''}
              </p>
            )}
          </div>
          <button className="edu-toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
};

export default Toaster;
