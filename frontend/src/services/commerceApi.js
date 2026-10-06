import api from './api';

// Coupons
export const getPublicCoupons = () => api.get('/coupons/public', { silent: true });
export const validateCoupon = (code, courseId) => api.post('/coupons/validate', { code, courseId });

// Checkout
export const markPaymentFailed = (orderId, reason) =>
  api.post('/payment/mark-failed', { razorpay_order_id: orderId, reason }, { silent: true });

// Orders + invoices
export const getOrders = ({ page = 1, limit = 5, status = 'all' } = {}) =>
  api.get('/orders', { params: { page, limit, status } });
export const getOrder = (orderId, config) => api.get(`/orders/${encodeURIComponent(orderId)}`, config);

// Money helpers shared by checkout / orders / invoice (rupees in, display string out)
export const formatINR = (n) => {
  const value = Number(n || 0);
  const hasPaise = Math.round(value * 100) % 100 !== 0;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
};

export const ORDER_STATUS = {
  paid: { label: 'Paid', tone: 'forest' },
  pending: { label: 'Pending', tone: 'ochre' },
  failed: { label: 'Failed', tone: 'danger' }
};
