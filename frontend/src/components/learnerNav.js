// Shared left-rail links for signed-in learner screens (used with AppShell)
export const LEARNER_LINKS = [
  { key: 'dashboard', label: 'Home', to: '/dashboard' },
  { key: 'lms', label: 'Classroom', to: '/lms' },
  { key: 'wishlist', label: 'Wishlist', to: '/wishlist' },
  { key: 'orders', label: 'Orders', to: '/orders' },
  { key: 'certificates', label: 'Certificates', to: '/certificates' },
  { key: 'bookings', label: 'My bookings', to: '/bookings' },
  { key: 'profile', label: 'Profile', to: '/profile' },
  { key: 'support', label: 'Support', to: '/support' }
];

export const learnerNav = (activeKey) =>
  LEARNER_LINKS.map((l) => ({ ...l, active: l.key === activeKey }));
