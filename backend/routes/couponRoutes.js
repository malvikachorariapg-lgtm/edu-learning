const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { verifyToken } = require('../middleware/auth');
const { quote, PricingError } = require('../services/pricingService');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

// Promo codes we advertise on the site (promo strip, checkout)
router.get('/public', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      active: true,
      featured: true,
      validFrom: { $lte: now },
      $or: [{ validUntil: null }, { validUntil: { $gte: now } }]
    })
      .select('code type value headline description minOrder maxDiscount validUntil usageLimit usedCount')
      .sort({ type: -1, value: -1 })
      .lean();

    const data = coupons
      .filter((c) => !(c.usageLimit > 0 && c.usedCount >= c.usageLimit))
      .slice(0, 3)
      .map(({ usageLimit, usedCount, _id, ...c }) => c);

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error loading promo codes', { error });
    res.status(500).json({ success: false, message: 'Could not load offers right now' });
  }
});

// Preview a coupon against a course at checkout
router.post('/validate', verifyToken, async (req, res) => {
  const { code, courseId } = req.body || {};
  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ success: false, message: 'Enter a coupon code' });
  }
  if (!courseId) {
    return res.status(400).json({ success: false, message: 'Course is required to apply a coupon' });
  }

  try {
    const q = await withSpan('coupon.validate', { 'edu.course.id': String(courseId) }, () =>
      quote({ courseId, couponCode: code })
    );

    logEvent('coupon.validated', {
      'enduser.id': String(req.user.id),
      'coupon.code': q.coupon.code,
      'course.id': String(courseId),
      'pricing.subtotal': q.subtotal,
      'pricing.discount': q.discount,
      'pricing.total': q.total
    });

    res.json({
      success: true,
      message: `${q.coupon.code} applied`,
      data: {
        code: q.coupon.code,
        description: q.coupon.description,
        discount: q.discount,
        subtotal: q.subtotal,
        total: q.total
      }
    });
  } catch (error) {
    if (error instanceof PricingError) {
      logEvent('coupon.rejected', {
        'enduser.id': String(req.user.id),
        'coupon.code': String(code).trim().toUpperCase().slice(0, 40),
        'course.id': String(courseId),
        'coupon.reject_reason': error.code,
        'coupon.reject_message': error.message
      }, 'warn');
      return res.status(error.status).json({ success: false, message: error.message, code: error.code });
    }
    logger.error('Error validating coupon', { error, 'course.id': String(courseId) });
    res.status(500).json({ success: false, message: 'Could not check that coupon. Please try again.' });
  }
});

module.exports = router;
