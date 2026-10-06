import axios from 'axios';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { toast } from '../components/Toaster';
import { uiLog } from './uiLog';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Every API failure surfaces as a toast (unless the call opts out with
// { silent: true }) and is recorded as an error span for tracing.
const tracer = trace.getTracer('edu-learning-web');

const describeError = (error) => {
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (!error.response) return 'Can’t reach the server. Check your connection and try again.';
  return error.response.data?.message || `Request failed (${error.response.status})`;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const traceId = error.response?.headers?.['x-trace-id'];
    const url = error.config?.url || '';
    const isAuthCall = url.startsWith('/auth/login') || url.startsWith('/auth/register');

    const span = tracer.startSpan('ui.api_error', {
      attributes: {
        'http.request.method': (error.config?.method || 'get').toUpperCase(),
        'url.path': url,
        'http.response.status_code': status || 0,
        'edu.backend_trace_id': traceId || ''
      }
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: describeError(error) });
    span.end();
    uiLog(status >= 500 || !status ? 'error' : 'warn', 'ui.api_error', {
      'http.request.method': (error.config?.method || 'get').toUpperCase(),
      'url.path': url,
      'http.response.status_code': status || 0,
      'error.message': describeError(error),
      'edu.backend_trace_id': traceId,
      'edu.toast_shown': !error.config?.silent
    });

    if (status === 401 && !isAuthCall) {
      // Session expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/auth') {
        toast.info('Your session has expired. Please log in again.');
        window.location.href = '/auth';
      }
      return Promise.reject(error);
    }

    if (!error.config?.silent) {
      toast.error(describeError(error), { status, traceId });
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const subscribeNewsletter = (email) => api.post('/newsletter/subscribe', { email, source: 'footer' });
export const getProfile = (userId) => api.get(`/auth/profile/${userId}`);
export const enrollInCourse = (data) => api.post('/auth/enroll', data);
export const updateProgress = (data) => api.post('/auth/progress', data);
export const updateSchedule = (courseId, startDate, endDate) =>
  api.patch(`/auth/enrollments/${courseId}/schedule`, { startDate, endDate });

// Course APIs
export const getAllCourses = () => api.get('/courses');
export const getCourseById = (id) => api.get(`/courses/${id}`);
export const getLesson = (courseId, moduleId, lessonId) => 
  api.get(`/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`);

// Payment APIs
export const createOrder = (data) => api.post('/payment/create-order', data);
export const verifyPayment = (data) => api.post('/payment/verify-payment', data);
export const getPaymentStatus = (orderId) => api.get(`/payment/status/${orderId}`);

// Admin APIs
export const getCoursesForAdmin = () => api.get('/admin/courses');
export const createCourse = (data) => api.post('/admin/courses', data);
export const updateCourse = (id, data) => api.put(`/admin/courses/${id}`, data);
export const deleteCourse = (id) => api.delete(`/admin/courses/${id}`);
export const uploadDocument = (formData) => 
  api.post('/admin/upload-document', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
export const summarizeDocument = (data) => api.post('/admin/summarize-document', data, { timeout: 120000 });

// Analytics API
export const getAnalytics = () => api.get('/admin/analytics');
export const getStudentProgress = () => api.get('/admin/student-progress');

export default api;
