const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const { verifyToken } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const STATUS_FILTERS = {
  all: null,
  paid: ['completed', 'success'],
  pending: ['pending'],
  failed: ['failed']
};

const toInt = (value, fallback, min, max) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

const readPaging = (query) => {
  const page = toInt(query.page, 1, 1, 100000);
  const limit = toInt(query.limit, 5, 1, 50);
  // zero-based index of the first row on this page
  const first = Math.max((page - 1) * limit - 1, 0);
  return { page, limit, skip: first };
};

// Orders belong to the user id on the payment; very old orders only carry the email
const ownerFilter = (user) => {
  const clauses = [{ userEmail: user.email, userId: null }];
  if (mongoose.isValidObjectId(user.id)) {
    clauses.unshift({ userId: new mongoose.Types.ObjectId(String(user.id)) });
  }
  return { $or: clauses };
};

const paiseOf = (p) =>
  Number.isFinite(p.amountPaise) ? p.amountPaise : Math.round(Number(p.amount || 0) * 100);

const statusKey = (status) => (status === 'success' || status === 'completed' ? 'paid' : status);

// Shape a payment document for the orders list / invoice
const toOrder = (p) => {
  const totalPaise = paiseOf(p);
  const subtotal = Number.isFinite(p.subtotal) ? p.subtotal : (p.courseId?.price ?? totalPaise / 100);
  return {
    id: p._id,
    orderId: p.razorpayOrderId,
    paymentId: p.razorpayPaymentId,
    status: statusKey(p.status),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    course: p.courseId
      ? {
          _id: p.courseId._id,
          title: p.courseId.title,
          category: p.courseId.category,
          instructor: p.courseId.instructor,
          thumbnail: p.courseId.thumbnail
        }
      : null,
    subtotal,
    couponCode: p.couponCode || null,
    discount: Number(p.discount || 0),
    total: totalPaise / 100,
    amountPaise: totalPaise,
    currency: p.currency || 'INR',
    startDate: p.startDate,
    endDate: p.endDate,
    billedTo: { name: p.userName, email: p.userEmail },
    failureReason: p.failureReason || null
  };
};

// GET /api/orders?page=1&limit=5&status=all|paid|pending|failed
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page, limit, skip } = readPaging(req.query);
    const statusKeyParam = String(req.query.status || 'all').toLowerCase();
    if (!(statusKeyParam in STATUS_FILTERS)) {
      return res.status(400).json({ success: false, message: 'Unknown status filter' });
    }

    const owner = ownerFilter(req.user);
    const statuses = STATUS_FILTERS[statusKeyParam];
    const filter = statuses ? { $and: [owner, { status: { $in: statuses } }] } : owner;

    const result = await withSpan('orders.list', { 'edu.orders.page': page }, async () => {
      const [rows, total, byStatus] = await Promise.all([
        Payment.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .populate('courseId', 'title category instructor thumbnail price')
          .lean(),
        Payment.countDocuments(filter),
        Payment.aggregate([{ $match: owner }, { $group: { _id: '$status', n: { $sum: 1 } } }])
      ]);
      return { rows, total, byStatus };
    });

    const counts = { all: 0, paid: 0, pending: 0, failed: 0 };
    result.byStatus.forEach(({ _id, n }) => {
      counts.all += n;
      const key = statusKey(_id);
      if (key in counts) counts[key] += n;
    });

    logEvent('orders.listed', {
      'enduser.id': String(req.user.id),
      'orders.page': page,
      'orders.limit': limit,
      'orders.status_filter': statusKeyParam,
      'orders.total': result.total,
      'orders.returned': result.rows.length
    });

    res.json({
      success: true,
      data: result.rows.map(toOrder),
      page,
      limit,
      total: result.total,
      totalPages: Math.max(Math.ceil(result.total / limit), 1),
      counts
    });
  } catch (error) {
    logger.error('Error loading orders', { error, 'enduser.id': String(req.user.id) });
    res.status(500).json({ success: false, message: 'Could not load your orders' });
  }
});

// GET /api/orders/:orderId — invoice for one order (owner or admin)
router.get('/:orderId', verifyToken, async (req, res) => {
  try {
    const key = String(req.params.orderId);
    const query = mongoose.isValidObjectId(key)
      ? { $or: [{ _id: key }, { razorpayOrderId: key }] }
      : { razorpayOrderId: key };

    const payment = await Payment.findOne(query)
      .populate('courseId', 'title category instructor thumbnail price duration')
      .lean();

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isOwner = payment.userId
      ? payment.userId.toString() === String(req.user.id)
      : payment.userEmail === req.user.email;
    if (!isOwner && req.user.role !== 'admin') {
      logEvent('invoice.access_denied', {
        'enduser.id': String(req.user.id),
        'order.id': payment.razorpayOrderId
      }, 'warn');
      return res.status(403).json({ success: false, message: 'You do not have access to this invoice' });
    }

    const order = toOrder(payment);
    logEvent('invoice.viewed', {
      'enduser.id': String(req.user.id),
      'enduser.role': req.user.role,
      'order.id': payment.razorpayOrderId,
      'order.status': order.status,
      'order.amount_paise': order.amountPaise
    });
    if (payment.courseId) order.course.duration = payment.courseId.duration;
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Error loading invoice', { error, 'order.id': String(req.params.orderId) });
    res.status(500).json({ success: false, message: 'Could not load this invoice' });
  }
});

module.exports = router;
