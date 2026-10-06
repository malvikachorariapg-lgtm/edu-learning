import React from 'react';

// Mark: an ink tile with an accent quarter-disc rising from the corner.
// Colours come from theme tokens so the mark follows light/dark mode.
export const LogoMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" style={{ fill: 'var(--ink)' }} />
    <path d="M32 32H12A20 20 0 0 1 32 12Z" style={{ fill: 'var(--accent)' }} />
    <rect x="7" y="7" width="9" height="2.6" style={{ fill: 'var(--ink-inverse)' }} />
  </svg>
);

const Logo = ({ inverted = false, size = 28 }) => (
  <span className={`edu-logo${inverted ? ' edu-logo--inverted' : ''}`}>
    <LogoMark size={size} />
    <span className="edu-logo__word">
      <em>Edu</em> Learning
    </span>
  </span>
);

export default Logo;
