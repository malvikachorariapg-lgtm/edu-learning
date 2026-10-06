const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Course = require('../models/Course');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { invalidateCourseCache } = require('../config/redis');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const MIN_TEXT = 10;
const MAX_TEXT = 1000;
const MAX_LIST = 50;

const courseNotFound = (res) => res.status(404).json({ success: false, message: 'Course not found' });

const toPublic = (r) => ({
  _id: r._id,
  courseId: r.courseId,
  userId: r.userId,
  userName: r.userName,
  rating: r.rating,
  text: r.text,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
});

const isEnrolled = async (userId, courseId) => {
  const user = await User.findOne(
    { _id: userId, 'enrolledCourses.courseId': courseId },
    { _id: 1 }
  ).lean();
  return Boolean(user);
};

// Public: reviews for a course, newest first, with the rating summary
router.get('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return courseNotFound(res);

    const course = await Course.findById(courseId).select('ratingAvg ratingCount').lean();
    if (!course) return courseNotFound(res);

    const [reviews, breakdownRows] = await Promise.all([
      Review.find({ courseId }).sort({ createdAt: -1 }).limit(MAX_LIST).lean(),
      Review.aggregate([
        { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
        { $group: { _id: '$rating', count: { $sum: 1 } } }
      ])
    ]);

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdownRows.forEach((row) => { breakdown[row._id] = row.count; });

    res.json({
      success: true,
      data: {
        average: course.ratingAvg || 0,
        count: course.ratingCount || 0,
        breakdown,
        reviews: reviews.map(toPublic)
      }
    });
  } catch (error) {
    logger.error('reviews.list_failed', { error, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not load reviews. Please try again.' });
  }
});

// Signed-in: can I review this course, and what did I write before?
router.get('/course/:courseId/mine', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return courseNotFound(res);

    const [enrolled, review] = await Promise.all([
      isEnrolled(req.user.id, courseId),
      Review.findOne({ courseId, userId: req.user.id }).lean()
    ]);

    res.json({ success: true, data: { enrolled, review: review ? toPublic(review) : null } });
  } catch (error) {
    logger.error('reviews.mine_failed', { error, 'enduser.id': req.user.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not load your review. Please try again.' });
  }
});

// Signed-in + enrolled: create or update my review
router.post('/course/:courseId', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) return courseNotFound(res);

    const rating = Number(req.body?.rating);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    const reject = (reason) => logEvent('review.rejected', { 'enduser.id': req.user.id, 'course.id': courseId, reason }, 'warn');

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      reject('invalid_rating');
      return res.status(400).json({ success: false, message: 'Please pick a rating between 1 and 5 stars.' });
    }
    if (text.length < MIN_TEXT) {
      reject('text_too_short');
      return res.status(400).json({ success: false, message: `Your review needs at least ${MIN_TEXT} characters.` });
    }
    if (text.length > MAX_TEXT) {
      reject('text_too_long');
      return res.status(400).json({ success: false, message: `Please keep your review under ${MAX_TEXT} characters.` });
    }

    const course = await Course.findById(courseId).select('_id').lean();
    if (!course) return courseNotFound(res);

    if (!(await isEnrolled(req.user.id, courseId))) {
      reject('not_enrolled');
      return res.status(403).json({ success: false, message: 'Only learners enrolled in this program can review it.' });
    }

    const result = await withSpan('reviews.upsert', { 'edu.course_id': courseId }, async () => {
      const existing = await Review.findOne({ courseId, userId: req.user.id }).select('_id').lean();
      const review = await Review.findOneAndUpdate(
        { courseId, userId: req.user.id },
        { $set: { rating, text, userName: req.user.name || 'Learner' } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      ).lean();
      const summary = await Review.refreshCourseRating(courseId);
      return { review, summary, created: !existing };
    });

    await invalidateCourseCache();

    logEvent(result.created ? 'review.submitted' : 'review.updated', {
      'enduser.id': req.user.id,
      'course.id': courseId,
      'review.id': String(result.review._id),
      'review.rating': rating,
      'review.text_length': text.length,
      'course.rating_avg': result.summary.ratingAvg,
      'course.rating_count': result.summary.ratingCount
    });

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? 'Thanks — your review is live.' : 'Your review has been updated.',
      data: { review: toPublic(result.review), average: result.summary.ratingAvg, count: result.summary.ratingCount }
    });
  } catch (error) {
    logger.error('review.save_failed', { error, 'enduser.id': req.user.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not save your review. Please try again.' });
  }
});

// Signed-in: delete my own review
router.delete('/:reviewId', verifyToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const review = await Review.findById(reviewId).lean();
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    if (String(review.userId) !== String(req.user.id)) {
      logEvent('review.delete_rejected', { 'enduser.id': req.user.id, 'review.id': reviewId, reason: 'not_owner' }, 'warn');
      return res.status(403).json({ success: false, message: 'You can only delete your own review.' });
    }

    await Review.deleteOne({ _id: reviewId });
    const summary = await Review.refreshCourseRating(review.courseId);
    await invalidateCourseCache();

    logEvent('review.deleted', {
      'enduser.id': req.user.id,
      'course.id': String(review.courseId),
      'review.id': reviewId,
      'review.rating': review.rating
    });

    res.json({
      success: true,
      message: 'Your review has been deleted.',
      data: { average: summary.ratingAvg, count: summary.ratingCount }
    });
  } catch (error) {
    logger.error('review.delete_failed', { error, 'enduser.id': req.user.id, 'review.id': req.params.reviewId });
    res.status(500).json({ success: false, message: 'Could not delete your review. Please try again.' });
  }
});

module.exports = router;
