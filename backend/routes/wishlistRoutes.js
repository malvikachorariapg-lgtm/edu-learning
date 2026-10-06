const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const { verifyToken } = require('../middleware/auth');
const { logger, logEvent } = require('../services/logger');

const COURSE_FIELDS = 'title price thumbnail category duration instructor level ratingAvg ratingCount isActive';

const userNotFound = (res) => res.status(404).json({ success: false, message: 'Account not found. Please sign in again.' });

// Saved courses, most recently saved first
const loadWishlist = async (userId) => {
  const user = await User.findById(userId)
    .select('wishlist')
    .populate('wishlist.courseId', COURSE_FIELDS)
    .lean();
  if (!user) return null;

  return (user.wishlist || [])
    .filter((item) => item.courseId)
    .map((item) => ({ ...item.courseId, addedAt: item.addedAt }))
    .reverse();
};

router.use(verifyToken);

// List saved courses
router.get('/', async (req, res) => {
  try {
    const items = await loadWishlist(req.user.id);
    if (!items) return userNotFound(res);
    res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    logger.error('wishlist.list_failed', { error, 'enduser.id': req.user.id });
    res.status(500).json({ success: false, message: 'Could not load your wishlist. Please try again.' });
  }
});

// Save a course
router.post('/', async (req, res) => {
  try {
    const { courseId } = req.body || {};
    const notFound = () => {
      logEvent('wishlist.add_rejected', { 'enduser.id': req.user.id, 'course.id': String(courseId || ''), reason: 'course_not_found' }, 'warn');
      return res.status(404).json({ success: false, message: 'Course not found' });
    };
    if (!courseId || !mongoose.isValidObjectId(courseId)) return notFound();

    const course = await Course.findOne({ _id: courseId, isActive: true }).select('title').lean();
    if (!course) return notFound();

    const result = await User.updateOne(
      { _id: req.user.id, 'wishlist.courseId': { $ne: course._id } },
      { $push: { wishlist: { courseId: course._id, addedAt: new Date() } } }
    );

    if (result.matchedCount === 0) {
      const exists = await User.exists({ _id: req.user.id });
      if (!exists) return userNotFound(res);
      logEvent('wishlist.duplicate', { 'enduser.id': req.user.id, 'course.id': String(course._id) }, 'warn');
      return res.status(409).json({ success: false, message: `"${course.title}" is already in your wishlist.` });
    }

    logEvent('wishlist.added', { 'enduser.id': req.user.id, 'course.id': String(course._id), 'course.title': course.title });
    res.status(201).json({ success: true, message: 'Saved to wishlist', data: { courseId: course._id } });
  } catch (error) {
    logger.error('wishlist.add_failed', { error, 'enduser.id': req.user.id, 'course.id': req.body?.courseId });
    res.status(500).json({ success: false, message: 'Could not save this course. Please try again.' });
  }
});

// Remove by course id (heart toggle)
router.delete('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const result = await User.updateOne(
      { _id: req.user.id },
      { $pull: { wishlist: { courseId } } }
    );
    if (result.matchedCount === 0) return userNotFound(res);
    if (result.modifiedCount === 0) {
      logEvent('wishlist.remove_rejected', { 'enduser.id': req.user.id, 'course.id': courseId, reason: 'not_saved' }, 'warn');
      return res.status(404).json({ success: false, message: 'This course is not in your wishlist.' });
    }

    logEvent('wishlist.removed', { 'enduser.id': req.user.id, 'course.id': courseId, 'wishlist.source': 'course' });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    logger.error('wishlist.remove_failed', { error, 'enduser.id': req.user.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not update your wishlist. Please try again.' });
  }
});

// Remove the saved item at a position in the list
router.delete('/:index', async (req, res) => {
  try {
    const index = Number(req.params.index);

    const user = await User.findById(req.user.id).select('wishlist').lean();
    if (!user) return userNotFound(res);

    const wishlist = user.wishlist || [];
    if (!Number.isInteger(index) || index < 0 || index >= wishlist.length) {
      logEvent('wishlist.remove_rejected', {
        'enduser.id': req.user.id,
        'wishlist.index': req.params.index,
        'wishlist.size': wishlist.length,
        reason: 'index_out_of_range'
      }, 'warn');
      return res.status(404).json({ success: false, message: 'That item is no longer in your wishlist.' });
    }

    await User.updateOne(
      { _id: req.user.id },
      { $pull: { wishlist: { _id: wishlist[index]._id } } }
    );

    logEvent('wishlist.removed', {
      'enduser.id': req.user.id,
      'wishlist.index': index,
      'wishlist.size': wishlist.length,
      'course.id': String(wishlist[index].courseId),
      'wishlist.source': 'list'
    });

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    logger.error('wishlist.remove_failed', { error, 'enduser.id': req.user.id, 'wishlist.index': req.params.index });
    res.status(500).json({ success: false, message: 'Could not update your wishlist. Please try again.' });
  }
});

module.exports = router;
