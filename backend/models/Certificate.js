const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  learnerName: { type: String, default: '' },
  courseTitle: { type: String, required: true },
  instructor: { type: String, default: '' },
  category: { type: String, default: '' },
  durationHours: { type: Number, default: 0 },
  issuedAt: { type: Date, default: Date.now }
}, { timestamps: true });

certificateSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);
