import api from './api';

// Quizzes
export const getCourseQuiz = (courseId, config) => api.get(`/quizzes/course/${courseId}`, config);
export const submitQuizAttempt = (courseId, answers) =>
  api.post(`/quizzes/course/${courseId}/attempts`, { answers });
export const getQuizAttempts = (courseId, config) => api.get(`/quizzes/course/${courseId}/attempts`, config);

// Certificates
export const getMyCertificates = () => api.get('/certificates');
export const getCourseCertificate = (courseId, config) => api.get(`/certificates/course/${courseId}`, config);

export const formatIssuedDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
