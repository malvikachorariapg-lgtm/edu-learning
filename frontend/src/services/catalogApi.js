import api from './api';

// ---- Courses ----
export const searchCourses = ({ search, category, sort } = {}) => {
  const params = {};
  if (search) params.search = search;
  if (category && category !== 'all') params.category = category;
  if (sort) params.sort = sort;
  return api.get('/courses', { params });
};

export const getCourse = (courseId, config) => api.get(`/courses/${courseId}`, config);

export const getRelatedCourses = (category) => api.get('/courses', { params: { category, sort: 'rating' } });

// ---- Reviews ----
export const getCourseReviews = (courseId) => api.get(`/reviews/course/${courseId}`);
export const getMyReview = (courseId) => api.get(`/reviews/course/${courseId}/mine`);
export const saveReview = (courseId, data) => api.post(`/reviews/course/${courseId}`, data);
export const deleteReview = (reviewId) => api.delete(`/reviews/${reviewId}`);

// ---- Wishlist ----
export const getWishlist = (config) => api.get('/wishlist', config);
export const addToWishlist = (courseId) => api.post('/wishlist', { courseId });
export const removeWishlistCourse = (courseId) => api.delete(`/wishlist/course/${courseId}`);
export const removeWishlistItem = (index) => api.delete(`/wishlist/${index}`);

// ---- Session helpers ----
export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

export const isSignedIn = () => Boolean(localStorage.getItem('token') && getStoredUser());

// Saved course ids shared by every heart on screen, so tiles and the detail
// page agree without each one refetching the wishlist.
let savedIds = null;
let savedFor = null;
let pending = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(savedIds));

export const loadSavedIds = (force = false) => {
  if (!isSignedIn()) {
    savedIds = new Set();
    return Promise.resolve(savedIds);
  }
  const token = localStorage.getItem('token');
  if (savedIds && savedFor === token && !force) return Promise.resolve(savedIds);
  if (!pending) {
    pending = getWishlist({ silent: true })
      .then((res) => {
        savedFor = token;
        savedIds = new Set((res.data?.data || []).map((c) => String(c._id)));
        notify();
        return savedIds;
      })
      .catch(() => {
        savedIds = savedIds || new Set();
        return savedIds;
      })
      .finally(() => { pending = null; });
  }
  return pending;
};

export const setSaved = (courseId, saved) => {
  savedIds = new Set(savedIds || []);
  if (saved) savedIds.add(String(courseId));
  else savedIds.delete(String(courseId));
  notify();
};

export const subscribeSaved = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// ---- Display helpers ----
const SERVER_ORIGIN = (process.env.REACT_APP_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');
export const FALLBACK_THUMB = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80';

export const thumbUrl = (thumbnail) => {
  if (!thumbnail) return FALLBACK_THUMB;
  if (/^https?:\/\//.test(thumbnail)) return thumbnail;
  return `${SERVER_ORIGIN}${thumbnail}`;
};

export const formatPrice = (price) => `₹${Number(price || 0).toLocaleString('en-IN')}`;

export const formatRating = (avg) => (Number(avg) || 0).toFixed(1);

// "12:30" → seconds
const toSeconds = (mmss) => {
  const parts = String(mmss || '').split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

export const totalRuntime = (lessons = []) => {
  const secs = lessons.reduce((sum, l) => sum + toSeconds(l.duration), 0);
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};
