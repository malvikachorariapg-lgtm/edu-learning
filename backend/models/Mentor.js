const mongoose = require('mongoose');

// Weekly availability windows are stored in IST wall-clock time.
const availabilitySchema = new mongoose.Schema({
  day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
  start: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  end: { type: String, required: true, match: /^\d{2}:\d{2}$/ }
}, { _id: false });

const mentorSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  bio: { type: String, required: true },
  highlights: [{ type: String }],
  categories: [{ type: String, enum: ['finance', 'technology', 'analytics', 'marketing', 'management'] }],
  expertise: [{ type: String, trim: true }],
  topics: [{ type: String, trim: true }],
  yearsExperience: { type: Number, min: 0, default: 0 },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  reviewsCount: { type: Number, min: 0, default: 0 },
  sessionsCount: { type: Number, min: 0, default: 0 },
  price: { type: Number, min: 0, default: 0 }, // rupees per session
  sessionMinutes: { type: Number, default: 30 },
  languages: [{ type: String }],
  city: { type: String },
  avatar: { type: String },
  availability: [availabilitySchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

mentorSchema.index({ categories: 1, rating: -1 });

module.exports = mongoose.model('Mentor', mentorSchema);
