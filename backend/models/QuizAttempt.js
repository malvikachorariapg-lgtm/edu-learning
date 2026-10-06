const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId },
    selected: [String],
    correct: Boolean,
    _id: false
  }],
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  percent: { type: Number, required: true },
  passed: { type: Boolean, required: true }
}, { timestamps: true });

quizAttemptSchema.index({ userId: 1, courseId: 1, createdAt: -1 });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
