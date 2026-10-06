// Single source of truth for brand copy used across pages.
export const BRAND = {
  name: 'Edu Learning',
  short: 'Edu',
  tagline: 'Learn the craft. Do the work.',
  description: 'Edu Learning runs small, mentor-led programs in finance, technology, analytics, marketing and management.',
  email: 'hello@edulearning.in',
  year: new Date().getFullYear()
};

export const SERVER_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5001';

export const CATEGORIES = [
  { key: 'finance', label: 'Finance' },
  { key: 'technology', label: 'Technology' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'management', label: 'Management' }
];
