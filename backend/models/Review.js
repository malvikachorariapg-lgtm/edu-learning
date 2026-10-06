const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Snapshot of the reviewer's display name so the public list needs no join
  userName: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  text: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// One review per learner per course
reviewSchema.index({ courseId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ courseId: 1, createdAt: -1 });

// Recompute the cached rating summary on the course
reviewSchema.statics.refreshCourseRating = async function (courseId) {
  const Course = mongoose.model('Course');
  const [summary] = await this.aggregate([
    { $match: { courseId: new mongoose.Types.ObjectId(String(courseId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const ratingAvg = summary ? Math.round(summary.avg * 10) / 10 : 0;
  const ratingCount = summary ? summary.count : 0;
  await Course.updateOne({ _id: courseId }, { $set: { ratingAvg, ratingCount } });
  return { ratingAvg, ratingCount };
};

module.exports = mongoose.model('Review', reviewSchema);
