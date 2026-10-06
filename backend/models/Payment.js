const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  // Amount payable in rupees after any coupon (used for revenue reporting)
  amount: {
    type: Number,
    required: true
  },
  // Amount actually charged via Razorpay, in paise
  amountPaise: {
    type: Number
  },
  // Course price before any coupon, in rupees
  subtotal: {
    type: Number
  },
  // Coupon applied at checkout (if any) and the rupee discount it gave
  couponCode: {
    type: String,
    default: null
  },
  discount: {
    type: Number,
    default: 0
  },
  // Reason reported by the gateway when a payment fails
  failureReason: {
    type: String,
    default: null
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'success'],
    default: 'pending'
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userEmail: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  // Study plan chosen at checkout; copied onto the enrollment once paid
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  }
}, {
  timestamps: true
});

// razorpayOrderId is already unique-indexed above
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ userEmail: 1 });
paymentSchema.index({ courseId: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
