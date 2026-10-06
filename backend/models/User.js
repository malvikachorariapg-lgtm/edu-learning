const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 280
  },
  avatarUrl: {
    type: String
  },
  notificationPrefs: {
    courseUpdates: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
    weeklyDigest: { type: Boolean, default: true }
  },
  wishlist: [{
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    addedAt: { type: Date, default: Date.now }
  }],
  failedLoginCount: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  lastLoginAt: {
    type: Date
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
  },
  enrolledCourses: [{
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    // Study plan the learner picked (UTC midnight dates)
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    },
    progress: [{
      moduleId: {
        type: mongoose.Schema.Types.ObjectId
      },
      lessonId: {
        type: mongoose.Schema.Types.ObjectId
      },
      completed: {
        type: Boolean,
        default: false
      },
      completedAt: {
        type: Date
      }
    }],
    completionPercentage: {
      type: Number,
      default: 0
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// email is unique-indexed above; these support the admin analytics/listing queries
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ 'enrolledCourses.courseId': 1 });

module.exports = mongoose.model('User', userSchema);
