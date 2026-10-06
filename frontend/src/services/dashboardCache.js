import api from './api';

// In-memory snapshot of the learner dashboard data so switching between
// screens renders instantly instead of showing a spinner every time.
export const DASHBOARD_CACHE_TTL = 5 * 60 * 1000;

let profileCache = { data: null, fetchedAt: 0 };

export const readDashboardCache = () => profileCache;

export const isDashboardCacheFresh = () =>
  !!profileCache.data && Date.now() - profileCache.fetchedAt < DASHBOARD_CACHE_TTL;

export const writeDashboardCache = (data) => {
  profileCache = { data, fetchedAt: Date.now() };
};

// Call after anything that changes the learner's enrolments or progress
export const invalidateDashboardCache = () => {
  profileCache = { data: null, fetchedAt: 0 };
};

// Writes that change enrolments, progress or study plans make the snapshot stale
const ENROLMENT_WRITES = [
  /^\/auth\/enroll/,
  /^\/auth\/enrollments\//,
  /^\/auth\/progress/,
  /^\/payment\/verify-payment/,
  /^\/orders/,
  /^\/quizzes/
];

api.interceptors.response.use((response) => {
  const method = (response.config?.method || 'get').toLowerCase();
  const url = response.config?.url || '';
  if (method !== 'get' && ENROLMENT_WRITES.some((re) => re.test(url))) {
    invalidateDashboardCache();
  }
  return response;
});
