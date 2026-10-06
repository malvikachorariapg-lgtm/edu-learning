const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['percent', 'flat'],
    required: true
  },
  // Percentage (0-100) for 'percent', rupees for 'flat'
  value: {
    type: Number,
    required: true,
    min: 0
  },
  // Minimum course price (rupees) for the code to apply
  minOrder: {
    type: Number,
    default: 0
  },
  // Cap on the discount in rupees (percent coupons only)
  maxDiscount: {
    type: Number,
    default: null
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    default: null
  },
  // 0 = unlimited
  usageLimit: {
    type: Number,
    default: 0
  },
  usedCount: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  },
  // Shown on receipts and the promo strip
  description: {
    type: String,
    default: ''
  },
  // Short label for the promo strip, e.g. "20% off"
  headline: {
    type: String,
    default: ''
  },
  // Whether the code is advertised publicly
  featured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

couponSchema.index({ active: 1, featured: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
