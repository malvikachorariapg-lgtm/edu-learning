const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { validateSchedule } = require('../services/scheduleService');
const Course = require('../models/Course');
const bcrypt = require('bcryptjs');
const { generateToken, verifyToken } = require('../middleware/auth');
const { authLimiter, authIpLimiter } = require('../middleware/rateLimiters');
const { counters } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');
const { learningStreak } = require('../services/learningActivity');
const { trace } = require('@opentelemetry/api');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FAILED_LOGINS = Number(process.env.AUTH_MAX_FAILED_LOGINS) || 5;
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES) || 15;

// 8+ characters with at least one letter and one number
const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters long';
  if (password.length > 128) return 'Password is too long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain both letters and numbers';
  return null;
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  avatarUrl: user.avatarUrl,
  enrolledCourses: user.enrolledCourses
});

// Register new user
router.post('/register', authIpLimiter, authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password' });
    }
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 80 characters' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    const weak = passwordProblem(password);
    if (weak) {
      return res.status(400).json({ success: false, message: weak });
    }

    const existingUser = await User.exists({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, lastLoginAt: new Date() });

    try {
      await user.save();
    } catch (saveError) {
      // Unique index on email catches concurrent duplicate registrations
      if (saveError.code === 11000) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      throw saveError;
    }

    counters.signIns.add(1, { method: 'register', role: user.role });
    logEvent('auth.registered', { 'enduser.id': String(user._id), 'enduser.role': user.role });
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: publicUser(user),
      token: generateToken(user)
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// Login user
router.post('/login', authIpLimiter, authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase(), isActive: true })
      .select('name email role phone avatarUrl password enrolledCourses failedLoginCount lockUntil');

    if (!user) {
      counters.signInFailures.add(1, { reason: 'unknown_user' });
      logEvent('auth.login_failed', { 'auth.failure_reason': 'unknown_user', 'auth.email_domain': String(email).split('@')[1] }, 'warn');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Account lockout after repeated failures
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      counters.signInFailures.add(1, { reason: 'locked' });
      logEvent('auth.login_blocked', { 'enduser.id': String(user._id), 'auth.locked_minutes_left': minutes }, 'warn');
      return res.status(423).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Too many failed attempts. Your account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`
      });
    }

    const isPasswordValid = Boolean(user.password) && await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      const attemptsLeft = MAX_FAILED_LOGINS - user.failedLoginCount;
      if (attemptsLeft <= 0) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        user.failedLoginCount = 0;
      }
      await user.save();
      counters.signInFailures.add(1, { reason: 'bad_password' });
      logEvent(attemptsLeft <= 0 ? 'auth.account_locked' : 'auth.login_failed', {
        'enduser.id': String(user._id),
        'auth.failure_reason': 'bad_password',
        'auth.attempts_left': Math.max(0, attemptsLeft)
      }, 'warn');
      return res.status(401).json({
        success: false,
        message: attemptsLeft > 0 && attemptsLeft <= 2
          ? `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left before your account is locked.`
          : attemptsLeft <= 0
            ? `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes.`
            : 'Invalid email or password'
      });
    }

    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    counters.signIns.add(1, { method: 'password', role: user.role });
    logEvent('auth.login_succeeded', { 'enduser.id': String(user._id), 'enduser.role': user.role });
    trace.getActiveSpan()?.setAttribute('enduser.id', String(user._id));

    res.json({
      success: true,
      message: 'Login successful',
      user: publicUser(user),
      token: generateToken(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// Get user profile (Protected Route)
router.get('/profile/:userId', verifyToken, async (req, res) => {
  try {
    // Check if user is accessing their own profile or is admin
    if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('enrolledCourses.courseId', 'title description instructor')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
});

// Change the study plan (start + end date) of an existing enrollment
router.patch('/enrollments/:courseId/schedule', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course' });
    }

    const user = await User.findById(req.user.id)
      .select('enrolledCourses.courseId enrolledCourses.startDate enrolledCourses.endDate')
      .lean();
    const enrollment = user?.enrolledCourses.find((ec) => String(ec.courseId) === courseId);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'You are not enrolled in this course' });
    }

    const schedule = validateSchedule(req.body.startDate, req.body.endDate, enrollment);
    if (!schedule.ok) {
      return res.status(400).json({ success: false, message: schedule.message });
    }

    await User.updateOne(
      { _id: req.user.id, 'enrolledCourses.courseId': courseId },
      { $set: { 'enrolledCourses.$.startDate': schedule.startDate, 'enrolledCourses.$.endDate': schedule.endDate } }
    );

    res.json({ success: true, data: { courseId, startDate: schedule.startDate, endDate: schedule.endDate } });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ success: false, message: 'Error updating your schedule' });
  }
});

// Enroll user in course (Protected Route)
router.post('/enroll', verifyToken, async (req, res) => {
  try {
    const { userId, courseId, paymentId } = req.body;

    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Course ID are required'
      });
    }

    // Verify user is enrolling themselves or is admin
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already enrolled
    const alreadyEnrolled = user.enrolledCourses.some(
      enrollment => enrollment.courseId.toString() === courseId
    );

    if (alreadyEnrolled) {
      return res.json({
        success: true,
        message: 'Already enrolled in this course'
      });
    }

    // Enroll user
    user.enrolledCourses.push({
      courseId,
      paymentId
    });

    await user.save();

    res.json({
      success: true,
      message: 'Successfully enrolled in course'
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({
      success: false,
      message: 'Enrollment failed',
      error: error.message
    });
  }
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name
    }
  });
});

// Update lesson progress (Protected Route)
router.post('/progress', verifyToken, async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.body;

    if (!courseId || !moduleId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID, Module ID, and Lesson ID are required'
      });
    }
    if (![courseId, moduleId, lessonId].every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: 'Invalid lesson' });
    }

    const user = await User.findById(req.user.id).select('enrolledCourses');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find the enrolled course
    const enrollment = user.enrolledCourses.find(
      e => e.courseId && e.courseId.toString() === courseId
    );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Not enrolled in this course'
      });
    }

    // Only the lesson ids are needed to validate the lesson and count lessons
    const course = await Course.findById(courseId).select('modules._id modules.lessons._id').lean();
    const courseModule = course?.modules.find(m => String(m._id) === moduleId);
    if (!courseModule || !(courseModule.lessons || []).some(l => String(l._id) === lessonId)) {
      return res.status(404).json({ success: false, message: 'Lesson not found in this course' });
    }
    const lessonIds = new Set(
      course.modules.flatMap(module => (module.lessons || []).map(lesson => String(lesson._id)))
    );

    // Keep the learner's daily streak up to date (shown on the dashboard)
    const { streakDays } = await learningStreak(user._id);

    // Rebuild this enrollment's progress with the lesson marked complete
    const completedAt = new Date();
    const progress = enrollment.progress
      .map(p => p.toObject())
      .filter(p => !(String(p.moduleId) === moduleId && String(p.lessonId) === lessonId));
    progress.push({ moduleId, lessonId, completed: true, completedAt });

    const completedLessons = progress.filter(p => p.completed && lessonIds.has(String(p.lessonId))).length;
    const completionPercentage = lessonIds.size > 0
      ? Math.min(100, Math.round((completedLessons / lessonIds.size) * 100))
      : 0;

    await User.updateOne(
      { _id: user._id, 'enrolledCourses.courseId': enrollment.courseId },
      {
        $set: {
          'enrolledCourses.$.progress': progress,
          'enrolledCourses.$.completionPercentage': completionPercentage
        }
      }
    );

    logEvent('lesson.completed', {
      'enduser.id': String(user._id),
      'course.id': courseId,
      'module.id': moduleId,
      'lesson.id': lessonId,
      'progress.completed_lessons': completedLessons,
      'progress.total_lessons': lessonIds.size,
      'progress.completion_percentage': completionPercentage,
      'learning.streak_days': streakDays
    });
    if (completionPercentage === 100) {
      logEvent('course.completed', { 'enduser.id': String(user._id), 'course.id': courseId });
    }

    res.json({
      success: true,
      message: 'Progress updated successfully',
      completionPercentage,
      // The classroom reads response.data.data.completionPercentage
      data: { completionPercentage, completedLessons, totalLessons: lessonIds.size, streakDays }
    });
  } catch (error) {
    logger.error('Progress update failed', { error, 'enduser.id': req.user?.id, 'course.id': req.body?.courseId, 'lesson.id': req.body?.lessonId });
    res.status(500).json({
      success: false,
      message: 'Failed to update progress',
      error: error.message
    });
  }
});

module.exports = router;
