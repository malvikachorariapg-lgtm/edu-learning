const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  text: { type: String, required: true }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ['single', 'multi'], default: 'single' },
  options: { type: [optionSchema], validate: (v) => Array.isArray(v) && v.length >= 2 },
  // Keys of the correct options, listed in option order
  correct: { type: [String], required: true },
  explanation: { type: String, default: '' }
});

const quizSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  passPercent: { type: Number, default: 60, min: 0, max: 100 },
  questions: [questionSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
