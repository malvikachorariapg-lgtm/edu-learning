import api from './api';

// Profile
export const getMyProfile = () => api.get('/users/me');
export const updateMyProfile = (data, config) => api.patch('/users/me', data, config);
export const changeMyPassword = (currentPassword, newPassword) =>
  api.post('/users/me/password', { currentPassword, newPassword }, { silent: true });

// Support
export const createSupportTicket = (data) => api.post('/support/tickets', data, { silent: true });
export const getMyTickets = () => api.get('/support/tickets');
export const getTicket = (id) => api.get(`/support/tickets/${id}`);
export const replyToTicket = (id, message) => api.post(`/support/tickets/${id}/replies`, { message });

// Keep the stored session user in sync so the header / sidebar show fresh details
export const syncStoredUser = (patch) => {
  try {
    const current = JSON.parse(localStorage.getItem('user') || 'null');
    if (!current) return;
    localStorage.setItem('user', JSON.stringify({ ...current, ...patch }));
  } catch (e) {
    // ignore malformed storage
  }
};
