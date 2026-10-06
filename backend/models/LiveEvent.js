const mongoose = require('mongoose');

const liveEventSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  summary: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['workshop', 'ama', 'webinar'], required: true },
  host: {
    name: { type: String, required: true },
    title: { type: String },
    avatar: { type: String }
  },
  category: { type: String, enum: ['finance', 'technology', 'analytics', 'marketing', 'management'], required: true },
  agenda: [{ type: String }],
  startsAt: { type: Date, required: true },
  durationMinutes: { type: Number, required: true, min: 15 },
  capacity: { type: Number, required: true, min: 1 },
  registeredCount: { type: Number, default: 0, min: 0 },
  format: { type: String, enum: ['online'], default: 'online' },
  level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'All levels'], default: 'All levels' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

liveEventSchema.index({ startsAt: 1 });

module.exports = mongoose.model('LiveEvent', liveEventSchema);
