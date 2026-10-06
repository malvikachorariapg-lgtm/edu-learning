const mongoose = require('mongoose');

const mentorBookingSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // IST calendar date
  time: { type: String, required: true, match: /^\d{2}:\d{2}$/ },        // IST start time
  startsAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 30 },
  topic: { type: String, required: true, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  price: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
  reference: { type: String, required: true },
  cancelledAt: { type: Date }
}, { timestamps: true });

// One confirmed booking per mentor slot. Cancelled bookings free the slot again.
mentorBookingSchema.index(
  { mentor: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' }, name: 'uniq_confirmed_slot' }
);
// A learner can't be in two sessions at once
mentorBookingSchema.index(
  { user: 1, startsAt: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' }, name: 'uniq_user_start' }
);
mentorBookingSchema.index({ user: 1, startsAt: -1 });

module.exports = mongoose.model('MentorBooking', mentorBookingSchema);
