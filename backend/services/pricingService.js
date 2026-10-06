// Single source of truth for checkout pricing: course subtotal, coupon discount and
// the amount to charge. Used by coupon validation (receipt preview) and create-order.
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Coupon = require('../models/Coupon');

class PricingError extends Error {
  constructor(message, status = 400, code = 'PRICING_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const formatRupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const loadCourse = async (courseId) => {
  const course = mongoose.isValidObjectId(courseId)
    ? await Course.findById(courseId).select('title price isActive').lean()
    : null;
  if (!course || course.isActive === false) {
    throw new PricingError('Course not found', 404, 'COURSE_NOT_FOUND');
  }
  const price = Number(course.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new PricingError('This course is not available for purchase (invalid price)', 400, 'INVALID_PRICE');
  }
  return { ...course, price };
};

// Checks a coupon against the order subtotal. Throws a PricingError with a
// customer-facing message when it can't be used.
const loadCoupon = async (rawCode, subtotal, now = new Date()) => {
  const code = normalizeCode(rawCode);
  if (!code) throw new PricingError('Enter a coupon code', 400, 'COUPON_EMPTY');
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new PricingError(`"${code}" isn't a valid coupon code`, 404, 'COUPON_UNKNOWN');
  }

  const coupon = await Coupon.findOne({ code }).lean();
  if (!coupon || !coupon.active) {
    throw new PricingError(`"${code}" isn't a valid coupon code`, 404, 'COUPON_UNKNOWN');
  }
  if (coupon.validFrom && now < new Date(coupon.validFrom)) {
    throw new PricingError('This coupon is not active yet', 400, 'COUPON_NOT_STARTED');
  }
  if (coupon.validUntil && now > new Date(coupon.validUntil)) {
    throw new PricingError('This coupon has expired', 400, 'COUPON_EXPIRED');
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new PricingError('This coupon has reached its usage limit', 400, 'COUPON_LIMIT');
  }
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    throw new PricingError(
      `${coupon.code} needs a minimum order of ${formatRupees(coupon.minOrder)}`,
      400,
      'COUPON_MIN_ORDER'
    );
  }
  return coupon;
};

// Price after the coupon, in rupees
const applyCoupon = (subtotal, coupon) => {
  if (!coupon) return subtotal;

  if (coupon.type === 'flat') {
    return Math.max(subtotal - coupon.value, 0);
  }

  let discounted = subtotal * (1 - coupon.value / 100);
  if (coupon.maxDiscount && subtotal - discounted > coupon.maxDiscount) {
    discounted = subtotal - coupon.maxDiscount;
  }
  return Math.max(discounted, 0);
};

/**
 * Quote a course purchase.
 * Returns rupee figures for display (subtotal, discount, total) plus the
 * amount to charge in paise.
 */
const quote = async ({ courseId, couponCode }) => {
  const course = await loadCourse(courseId);
  const subtotal = course.price;

  const coupon = couponCode ? await loadCoupon(couponCode, subtotal) : null;
  const payable = applyCoupon(subtotal, coupon);

  const total = Math.floor(payable);
  return {
    course,
    coupon,
    subtotal,
    discount: subtotal - total,
    total,
    amountPaise: Math.round(payable * 100)
  };
};

module.exports = { quote, normalizeCode, PricingError };
