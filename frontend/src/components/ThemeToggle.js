import React, { useEffect, useState } from 'react';

// The initial theme is applied by an inline script in public/index.html
// (before first paint, so there is no flash). This keeps it in sync after.
const STORAGE_KEY = 'edu-theme';

export const getTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* private mode */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F3EF' : '#0D0D0D');
  window.dispatchEvent(new CustomEvent('edu-theme-change', { detail: theme }));
};

const ThemeToggle = ({ className = '' }) => {
  const [theme, setTheme] = useState(getTheme);

  // Keep several toggles on one screen (header + mobile menu) in sync
  useEffect(() => {
    const onChange = (e) => setTheme(e.detail);
    window.addEventListener('edu-theme-change', onChange);
    return () => window.removeEventListener('edu-theme-change', onChange);
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span className={`theme-toggle__opt${theme === 'dark' ? ' is-on' : ''}`} aria-hidden="true">
        <i className="bi bi-moon-stars-fill" />
      </span>
      <span className={`theme-toggle__opt${theme === 'light' ? ' is-on' : ''}`} aria-hidden="true">
        <i className="bi bi-sun-fill" />
      </span>
    </button>
  );
};

export default ThemeToggle;
