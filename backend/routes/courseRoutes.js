const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const { cacheMiddleware } = require('../config/redis');
const { logger, logEvent } = require('../services/logger');

// Public course data is cached in Redis; admin create/update/delete/upload invalidate it
const COURSE_CACHE_SECONDS = Number(process.env.COURSE_CACHE_SECONDS) || 600;

// The list view only needs course cards + module/lesson counts and titles, so heavy
// per-lesson fields (video URLs, documents, long descriptions) are left out.
const LIST_PROJECTION = '-__v -modules.lessons.videoUrl -modules.lessons.document -modules.lessons.description';

const notFoundId = (res) => res.status(404).json({ success: false, message: 'Course not found' });

const CATEGORIES = Course.schema.path('category').enumValues;

const SORTS = {
  price_asc: { price: 1, title: 1 },
  price_desc: { price: -1, title: 1 },
  rating: { ratingAvg: -1, ratingCount: -1, title: 1 },
  newest: { createdAt: -1, _id: -1 }
};
const DEFAULT_SORT = { createdAt: 1, _id: 1 };

// Get all courses (optionally filtered by ?search=, ?category= and ordered by ?sort=)
router.get('/', cacheMiddleware(COURSE_CACHE_SECONDS), async (req, res) => {
  try {
    const { search, category, sort } = req.query;
    const filter = { isActive: true };

    if (typeof category === 'string' && category !== 'all') {
      if (!CATEGORIES.includes(category)) {
        logEvent('catalog.search_rejected', { 'search.category': category, reason: 'unknown_category' }, 'warn');
        return res.status(400).json({ success: false, message: 'Unknown category' });
      }
      filter.category = category;
    }

    if (typeof search === 'string' && search.length > 0) {
      const pattern = new RegExp(search, 'i');
      filter.$or = [
        { title: pattern },
        { description: pattern },
        { instructor: pattern }
      ];
    }

    const courses = await Course.find(filter)
      .select(LIST_PROJECTION)
      .sort(SORTS[sort] || DEFAULT_SORT)
      .lean();

    if (search !== undefined || category !== undefined || sort !== undefined) {
      logEvent('catalog.search', {
        'search.term': typeof search === 'string' ? search : '',
        'search.term_length': typeof search === 'string' ? search.length : 0,
        'search.category': category || 'all',
        'search.sort': sort || 'featured',
        'search.result_count': courses.length
      });
    }

    res.json({
      success: true,
      count: courses.length,
      data: courses
    });
  } catch (error) {
    logger.error('catalog.search_failed', {
      error,
      'search.term': req.query.search,
      'search.category': req.query.category,
      'search.sort': req.query.sort
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching courses'
    });
  }
});

// Get single course by ID
router.get('/:id', cacheMiddleware(COURSE_CACHE_SECONDS), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFoundId(res);
    const course = await Course.findById(req.params.id).select('-__v').lean();
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    res.json({
      success: true,
      data: course
    });
  } catch (error) {
    logger.error('course.fetch_failed', { error, 'course.id': req.params.id });
    res.status(500).json({
      success: false,
      message: 'Error fetching course',
      error: error.message
    });
  }
});

// Get specific lesson from a course
router.get('/:courseId/modules/:moduleId/lessons/:lessonId', cacheMiddleware(COURSE_CACHE_SECONDS), async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.params;

    if (!mongoose.isValidObjectId(courseId)) return notFoundId(res);
    const course = await Course.findById(courseId).select('title modules').lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const module = (course.modules || []).find(m => String(m._id) === moduleId);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    const lesson = (module.lessons || []).find(l => String(l._id) === lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    res.json({
      success: true,
      data: {
        course: {
          id: course._id,
          title: course.title
        },
        module: {
          id: module._id,
          title: module.title
        },
        lesson: lesson
      }
    });
  } catch (error) {
    logger.error('lesson.fetch_failed', { error, 'course.id': req.params.courseId, 'lesson.id': req.params.lessonId });
    res.status(500).json({
      success: false,
      message: 'Error fetching lesson',
      error: error.message
    });
  }
});

module.exports = router;
