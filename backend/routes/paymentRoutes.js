const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Course = require('../models/Course');
const { verifyToken } = require('../middleware/auth');
const { validateSchedule } = require('../services/scheduleService');
const { quote, PricingError } = require('../services/pricingService');
const Coupon = require('../models/Coupon');
const { counters } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');
const { trace } = require('@opentelemetry/api');

// Initialize Razorpay (will work when keys are provided)
let razorpayInstance = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// Test mode (auto-approved payments) is only allowed when Razorpay is not configured,
// and never in production unless explicitly enabled.
const testModeAllowed = () =>
  !razorpayInstance && (process.env.NODE_ENV !== 'production' || process.env.PAYMENT_TEST_MODE === 'true');

// Resolve which user a payment request is for: students can only act for themselves
const resolveUserId = (req) => {
  const requested = req.body.userId;
  if (req.user.role === 'admin' && requested) return String(requested);
  return String(req.user.id);
};

// Enroll a user in the course recorded on the payment (idempotent)
const enrollFromPayment = async (userId, payment) => {
  const courseId = payment.courseId._id || payment.courseId;
  const result = await User.updateOne(
    { _id: userId, 'enrolledCourses.courseId': { $ne: courseId } },
    {
      $push: {
        enrolledCourses: {
          courseId,
          enrolledAt: new Date(),
          startDate: payment.startDate,
          endDate: payment.endDate,
          paymentId: payment._id,
          progress: [],
          completionPercentage: 0
        }
      }
    }
  );
  if (result.matchedCount === 0) {
    // Either already enrolled or user doesn't exist
    return User.exists({ _id: userId });
  }
  counters.enrollments.add(1);
  return true;
};

// Count a coupon redemption once the order it was used on is paid
const redeemCoupon = async (payment) => {
  if (!payment.couponCode) return;
  try {
    await Coupon.updateOne({ code: payment.couponCode }, { $inc: { usedCount: 1 } });
    logEvent('coupon.redeemed', { 'coupon.code': payment.couponCode, 'order.id': payment.razorpayOrderId });
  } catch (err) {
    logger.error('Could not record coupon redemption', { error: err, 'coupon.code': payment.couponCode });
  }
};

const logOrderCreated = (payment, mode) =>
  logEvent('order.created', {
    'enduser.id': String(payment.userId),
    'order.id': payment.razorpayOrderId,
    'course.id': String(payment.courseId),
    'order.amount_paise': payment.amountPaise,
    'order.subtotal': payment.subtotal,
    'coupon.code': payment.couponCode || undefined,
    'payment.mode': mode
  });

const logVerified = (payment, mode) =>
  logEvent('payment.verified', {
    'enduser.id': String(payment.userId),
    'order.id': payment.razorpayOrderId,
    'payment.id': payment.razorpayPaymentId,
    'order.amount_paise': payment.amountPaise,
    'coupon.code': payment.couponCode || undefined,
    'payment.mode': mode
  });

const logFailed = (payment, reason, level = 'warn') =>
  logEvent('payment.failed', {
    'enduser.id': payment.userId ? String(payment.userId) : undefined,
    'order.id': payment.razorpayOrderId,
    'order.amount_paise': payment.amountPaise,
    'payment.failure_reason': reason
  }, level);

// Create order
router.post('/create-order', verifyToken, async (req, res) => {
  try {
    const { courseId, userEmail, userName, startDate, endDate, couponCode } = req.body;
    const userId = resolveUserId(req);

    if (!courseId || !userEmail || !userName || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: courseId, userEmail, userName, userId'
      });
    }

    // Price always comes from the DB (never the client): course price plus any
    // coupon, re-validated here. Throws a PricingError for unknown course/coupon.
    let pricing;
    try {
      pricing = await quote({ courseId, couponCode });
    } catch (err) {
      if (err instanceof PricingError) {
        logEvent('order.rejected', {
          'enduser.id': userId,
          'course.id': String(courseId),
          'coupon.code': couponCode ? String(couponCode).slice(0, 40) : undefined,
          'order.reject_reason': err.code
        }, 'warn');
        return res.status(err.status).json({ success: false, message: err.message });
      }
      throw err;
    }

    // Check if user already enrolled
    const user = await User.findById(userId).select('enrolledCourses.courseId').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const alreadyEnrolled = user.enrolledCourses.some(
      ec => ec.courseId && ec.courseId.toString() === String(courseId)
    );

    if (alreadyEnrolled) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course'
      });
    }

    const amountPaise = pricing.amountPaise;
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return res.status(400).json({
        success: false,
        message: 'Order total must be at least ₹1'
      });
    }

    const schedule = validateSchedule(startDate, endDate);
    if (!schedule.ok) {
      return res.status(400).json({ success: false, message: schedule.message });
    }

    // Common fields stored on the payment record (rupees, plus paise as charged)
    const orderFields = {
      amount: amountPaise / 100,
      amountPaise,
      subtotal: pricing.subtotal,
      couponCode: pricing.coupon ? pricing.coupon.code : null,
      discount: pricing.coupon ? pricing.subtotal - amountPaise / 100 : 0,
      courseId,
      userEmail,
      userName,
      userId,
      startDate: schedule.startDate,
      endDate: schedule.endDate
    };

    // If Razorpay is not configured, return test mode response (dev only)
    if (!razorpayInstance) {
      if (!testModeAllowed()) {
        return res.status(503).json({
          success: false,
          message: 'Payments are temporarily unavailable'
        });
      }

      const testOrder = {
        razorpayOrderId: 'test_order_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        currency: 'INR',
        ...orderFields
      };

      const payment = await Payment.create(testOrder);
      counters.ordersCreated.add(1, { mode: 'test' });
      logOrderCreated(payment, 'test');
      trace.getActiveSpan()?.setAttributes({ 'edu.course.id': String(courseId), 'edu.order.amount_paise': amountPaise });

      return res.json({
        success: true,
        testMode: true,
        message: 'Test mode - Razorpay keys not configured',
        data: {
          orderId: testOrder.razorpayOrderId,
          amount: amountPaise,
          currency: testOrder.currency,
          key: 'test_key',
          paymentId: payment._id,
          couponCode: orderFields.couponCode
        }
      });
    }

    // Create Razorpay order
    const order = await razorpayInstance.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        courseId: String(courseId),
        userId: String(userId),
        ...(orderFields.couponCode ? { coupon: orderFields.couponCode } : {})
      }
    });

    // Save payment record (amount in rupees for reporting, amountPaise as charged)
    const payment = await Payment.create({
      ...orderFields,
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency
    });

    counters.ordersCreated.add(1, { mode: 'razorpay' });
    logOrderCreated(payment, 'razorpay');
    trace.getActiveSpan()?.setAttributes({ 'edu.course.id': String(courseId), 'edu.order.amount_paise': order.amount });

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        paymentId: payment._id,
        couponCode: orderFields.couponCode
      }
    });
  } catch (error) {
    logger.error('Error creating order', { error, 'course.id': String(req.body?.courseId || '') });
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
});

// Verify payment and enroll user
router.post('/verify-payment', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = resolveUserId(req);

    if (!razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Find payment record - course and amount come from here, not from the client
    const payment = await Payment.findOne({ razorpayOrderId: String(razorpay_order_id) }).populate('courseId', 'title price');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // The order must belong to the user being enrolled
    if (payment.userId && payment.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'This order does not belong to the current user'
      });
    }

    if (!payment.courseId) {
      return res.status(404).json({
        success: false,
        message: 'Course for this payment no longer exists'
      });
    }

    // Test mode - auto verify (only when test mode is allowed)
    if (payment.razorpayOrderId.startsWith('test_order_')) {
      if (!testModeAllowed()) {
        return res.status(400).json({
          success: false,
          message: 'Test payments are not accepted'
        });
      }

      const wasPaid = ['completed', 'success'].includes(payment.status);
      payment.status = 'completed';
      payment.razorpayPaymentId = payment.razorpayPaymentId || razorpay_payment_id || 'test_payment_' + Date.now();
      await payment.save();
      if (!wasPaid) {
        await redeemCoupon(payment);
        logVerified(payment, 'test');
      }

      const enrolled = await enrollFromPayment(userId, payment);
      if (!enrolled) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      return res.json({
        success: true,
        testMode: true,
        message: 'Payment verified and user enrolled successfully (test mode)',
        data: {
          payment,
          enrolled: true
        }
      });
    }

    // Verify signature
    if (!razorpayInstance) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay not configured'
      });
    }

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID and signature are required'
      });
    }

    const sign = payment.razorpayOrderId + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest('hex');

    const signatureValid = typeof razorpay_signature === 'string' &&
      razorpay_signature.length === expectedSign.length &&
      crypto.timingSafeEqual(Buffer.from(razorpay_signature), Buffer.from(expectedSign));

    if (!signatureValid) {
      payment.status = 'failed';
      await payment.save();
      logFailed(payment, 'invalid_signature', 'error');

      return res.status(400).json({
        success: false,
        message: 'Invalid signature - Payment verification failed'
      });
    }

    // Double-check with Razorpay that this payment is for our order and the stored amount
    const expectedPaise = payment.amountPaise || Math.round(Number(payment.amount) * 100);
    try {
      const rzpPayment = await razorpayInstance.payments.fetch(razorpay_payment_id);
      if (rzpPayment.order_id !== payment.razorpayOrderId ||
          Number(rzpPayment.amount) !== expectedPaise ||
          !['captured', 'authorized'].includes(rzpPayment.status)) {
        payment.status = 'failed';
        await payment.save();
        logFailed(payment, 'amount_or_order_mismatch', 'error');
        return res.status(400).json({
          success: false,
          message: 'Payment amount/order mismatch - verification failed'
        });
      }
    } catch (fetchError) {
      logger.error('Razorpay payment fetch failed', { error: fetchError, 'order.id': payment.razorpayOrderId });
      return res.status(502).json({
        success: false,
        message: 'Could not confirm payment with Razorpay. Please contact support if you were charged.'
      });
    }

    const wasPaid = ['completed', 'success'].includes(payment.status);
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'completed';
    payment.failureReason = null;
    await payment.save();
    if (!wasPaid) {
      await redeemCoupon(payment);
      logVerified(payment, 'razorpay');
    }

    const enrolled = await enrollFromPayment(userId, payment);
    if (!enrolled) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment verified and user enrolled successfully',
      data: {
        payment,
        enrolled: true
      }
    });
  } catch (error) {
    logger.error('Error verifying payment', { error });
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message
    });
  }
});

// Record a failed attempt reported by the checkout widget (owner only, pending orders only)
router.post('/mark-failed', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, reason } = req.body || {};
    if (!razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: String(razorpay_order_id) });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }
    if (payment.userId && payment.userId.toString() !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'This order does not belong to the current user' });
    }

    if (payment.status === 'pending') {
      payment.status = 'failed';
      payment.failureReason = typeof reason === 'string' ? reason.slice(0, 200) : 'Payment was declined';
      await payment.save();
      logFailed(payment, payment.failureReason);
    }

    res.json({ success: true, message: 'Payment status updated', data: { status: payment.status } });
  } catch (error) {
    logger.error('Error marking payment failed', { error });
    res.status(500).json({ success: false, message: 'Error updating payment status' });
  }
});

// Check payment status (owner or admin only)
router.get('/status/:orderId', verifyToken, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      razorpayOrderId: String(req.params.orderId)
    }).populate('courseId', 'title description price thumbnail').lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (req.user.role !== 'admin' && payment.userId && payment.userId.toString() !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    logger.error('Error checking payment status', { error });
    res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
});

module.exports = router;
