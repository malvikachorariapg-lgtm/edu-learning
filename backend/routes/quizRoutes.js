const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Course = require('../models/Course');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const MAX_ATTEMPTS_LISTED = 20;

// Learners must be enrolled to see or take a course quiz; admins can preview any quiz.
const assertEnrolled = async (req, courseId) => {
  if (req.user.role === 'admin') return true;
  const enrolled = await User.exists({ _id: req.user.id, 'enrolledCourses.courseId': courseId });
  return Boolean(enrolled);
};

const summarizeAttempts = (attempts) => {
  if (!attempts.length) return { attemptsCount: 0, best: null, lastAttemptAt: null, everPassed: false };
  const best = attempts.reduce((top, a) => (a.percent > top.percent ? a : top), attempts[0]);
  return {
    attemptsCount: attempts.length,
    best: { score: best.score, total: best.total, percent: best.percent, passed: best.passed, at: best.createdAt },
    lastAttemptAt: attempts[0].createdAt,
    everPassed: attempts.some((a) => a.passed)
  };
};

const publicAttempt = (a) => ({
  id: a._id,
  score: a.score,
  total: a.total,
  percent: a.percent,
  passed: a.passed,
  createdAt: a.createdAt
});

const validCourseId = (req, res) => {
  const { courseId } = req.params;
  if (!mongoose.isValidObjectId(courseId)) {
    res.status(400).json({ success: false, message: 'Invalid course' });
    return null;
  }
  return courseId;
};

// GET /api/quizzes/course/:courseId — the quiz for a course, without the answer key
router.get('/course/:courseId', verifyToken, async (req, res) => {
  try {
    const courseId = validCourseId(req, res);
    if (!courseId) return;

    if (!(await assertEnrolled(req, courseId))) {
      logEvent('quiz.access_denied', { 'enduser.id': req.user.id, 'course.id': courseId }, 'warn');
      return res.status(403).json({ success: false, message: 'Enroll in this course to take its quiz' });
    }

    const [quiz, course, attempts] = await Promise.all([
      Quiz.findOne({ courseId, isActive: true }).select('-questions.correct -questions.explanation').lean(),
      Course.findById(courseId).select('title category instructor').lean(),
      QuizAttempt.find({ userId: req.user.id, courseId }).sort({ createdAt: -1 }).limit(MAX_ATTEMPTS_LISTED).lean()
    ]);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (!quiz || !quiz.questions?.length) {
      return res.status(404).json({ success: false, message: 'This course does not have a quiz yet' });
    }

    logEvent('quiz.started', {
      'enduser.id': req.user.id,
      'course.id': courseId,
      'quiz.id': String(quiz._id),
      'quiz.questions': quiz.questions.length,
      'quiz.previous_attempts': attempts.length
    });

    res.json({
      success: true,
      data: {
        quiz: {
          id: quiz._id,
          title: quiz.title,
          description: quiz.description,
          passPercent: quiz.passPercent,
          questions: quiz.questions.map((q) => ({
            id: q._id,
            text: q.text,
            type: q.type,
            options: q.options.map((o) => ({ key: o.key, text: o.text }))
          }))
        },
        course: { id: course._id, title: course.title, category: course.category, instructor: course.instructor },
        history: summarizeAttempts(attempts)
      }
    });
  } catch (error) {
    logger.error('Quiz load failed', { error, 'enduser.id': req.user?.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not load the quiz. Please try again.' });
  }
});

// POST /api/quizzes/course/:courseId/attempts — grade a submission and record it
router.post('/course/:courseId/attempts', verifyToken, async (req, res) => {
  try {
    const courseId = validCourseId(req, res);
    if (!courseId) return;

    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'Please answer the questions before submitting' });
    }

    if (!(await assertEnrolled(req, courseId))) {
      return res.status(403).json({ success: false, message: 'Enroll in this course to take its quiz' });
    }

    const quiz = await Quiz.findOne({ courseId, isActive: true }).lean();
    if (!quiz || !quiz.questions?.length) {
      return res.status(404).json({ success: false, message: 'This course does not have a quiz yet' });
    }

    const unanswered = quiz.questions.filter((q) => {
      const picked = answers[String(q._id)];
      return !Array.isArray(picked) || picked.length === 0;
    });
    if (unanswered.length) {
      return res.status(400).json({
        success: false,
        message: `Please answer all questions (${unanswered.length} left)`
      });
    }

    const graded = await withSpan('quiz.grade', { 'edu.course_id': courseId, 'edu.quiz.questions': quiz.questions.length }, async () =>
      quiz.questions.map((q) => {
        const validKeys = new Set(q.options.map((o) => o.key));
        // Keep only real option keys, once each
        const picked = [...new Set(answers[String(q._id)].map(String))].filter((k) => validKeys.has(k));
        const selected = q.type === 'single' ? picked.slice(0, 1) : picked;
        const correct = JSON.stringify(selected) === JSON.stringify(q.correct);
        return {
          questionId: q._id,
          selected,
          correct,
          correctKeys: q.correct,
          explanation: q.explanation
        };
      })
    );

    const score = graded.filter((g) => g.correct).length;
    const total = quiz.questions.length;
    const percent = Math.round((score / total) * 100);
    const passed = percent >= quiz.passPercent;

    const attempt = await QuizAttempt.create({
      userId: req.user.id,
      courseId,
      quizId: quiz._id,
      answers: graded.map(({ questionId, selected, correct }) => ({ questionId, selected, correct })),
      score,
      total,
      percent,
      passed
    });

    logEvent('quiz.submitted', {
      'enduser.id': req.user.id,
      'course.id': courseId,
      'quiz.id': String(quiz._id),
      'quiz.attempt_id': String(attempt._id),
      'quiz.score': score,
      'quiz.total': total,
      'quiz.percent': percent,
      'quiz.passed': passed,
      'quiz.pass_percent': quiz.passPercent,
      'quiz.question_results': graded.map((g) => g.correct)
    });

    res.status(201).json({
      success: true,
      message: passed ? 'Quiz passed' : 'Quiz submitted',
      data: {
        attemptId: attempt._id,
        score,
        total,
        percent,
        passed,
        passPercent: quiz.passPercent,
        results: graded.map(({ questionId, selected, correct, correctKeys, explanation }) => ({
          questionId,
          selected,
          correct,
          correctKeys,
          explanation
        }))
      }
    });
  } catch (error) {
    logger.error('Quiz submission failed', { error, 'enduser.id': req.user?.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not submit your answers. Please try again.' });
  }
});

// GET /api/quizzes/course/:courseId/attempts — the learner's attempt history
router.get('/course/:courseId/attempts', verifyToken, async (req, res) => {
  try {
    const courseId = validCourseId(req, res);
    if (!courseId) return;

    const attempts = await QuizAttempt.find({ userId: req.user.id, courseId })
      .sort({ createdAt: -1 })
      .limit(MAX_ATTEMPTS_LISTED)
      .select('score total percent passed createdAt')
      .lean();

    res.json({
      success: true,
      data: {
        ...summarizeAttempts(attempts),
        attempts: attempts.map(publicAttempt)
      }
    });
  } catch (error) {
    logger.error('Quiz history load failed', { error, 'enduser.id': req.user?.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not load your quiz history' });
  }
});

module.exports = router;
