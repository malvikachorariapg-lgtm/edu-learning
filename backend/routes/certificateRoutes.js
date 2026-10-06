const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Stable, human-friendly id derived from the learner + course pair, e.g. EDU-7KQ2-M9XD
const certificateIdFor = (userId, courseId) => {
  const digest = crypto.createHash('sha256').update(`${userId}:${courseId}`).digest();
  const chars = Array.from(digest.subarray(0, 8), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
  return `EDU-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
};

// The certificate typeface only ships basic Latin glyphs
const printableName = (name) => String(name || '').replace(/[^a-zA-Z .'-]/g, '').replace(/\s+/g, ' ').trim();

// "mm:ss" or "h:mm:ss" -> seconds
const durationSeconds = (value) => {
  const parts = String(value || '').split(':').map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

const courseHours = (course) => {
  const seconds = (course.modules || []).reduce(
    (sum, m) => sum + (m.lessons || []).reduce((s, l) => s + durationSeconds(l.duration), 0),
    0
  );
  return Math.round((seconds / 3600) * 10) / 10;
};

// Lesson completion measured against the course's current lessons
const completionFor = (course, enrollment) => {
  const lessonIds = (course.modules || []).flatMap((m) => (m.lessons || []).map((l) => String(l._id)));
  const done = new Set((enrollment.progress || []).filter((p) => p.completed).map((p) => String(p.lessonId)));
  const completedLessons = lessonIds.filter((id) => done.has(id)).length;
  const totalLessons = lessonIds.length;
  return {
    completedLessons,
    totalLessons,
    completionPercentage: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    isComplete: totalLessons > 0 && completedLessons === totalLessons
  };
};

const publicCertificate = (cert) => ({
  certificateId: cert.certificateId,
  courseId: cert.courseId,
  learnerName: cert.learnerName,
  courseTitle: cert.courseTitle,
  instructor: cert.instructor,
  category: cert.category,
  durationHours: cert.durationHours,
  issuedAt: cert.issuedAt
});

// Issue the certificate the first time it is requested; keep the name in step with the profile.
const issueCertificate = async (user, course) => {
  const learnerName = printableName(user.name);
  const existing = await Certificate.findOne({ userId: user._id, courseId: course._id }).lean();

  if (existing) {
    if (existing.learnerName !== learnerName) {
      await Certificate.updateOne({ _id: existing._id }, { $set: { learnerName } });
      logEvent('certificate.name_updated', {
        'enduser.id': String(user._id),
        'course.id': String(course._id),
        'certificate.id': existing.certificateId
      });
      return { ...existing, learnerName };
    }
    return existing;
  }

  try {
    const created = await Certificate.create({
      certificateId: certificateIdFor(user._id, course._id),
      userId: user._id,
      courseId: course._id,
      learnerName,
      courseTitle: course.title,
      instructor: course.instructor || 'Edu Learning',
      category: course.category || '',
      durationHours: courseHours(course),
      issuedAt: new Date()
    });
    logEvent('certificate.issued', {
      'enduser.id': String(user._id),
      'course.id': String(course._id),
      'certificate.id': created.certificateId,
      'certificate.learner_name_length': learnerName.length
    });
    return created.toObject();
  } catch (err) {
    // Two tabs opening the certificate at once: the other request already issued it
    if (err.code === 11000) {
      return Certificate.findOne({ userId: user._id, courseId: course._id }).lean();
    }
    throw err;
  }
};

const COURSE_FIELDS = 'title instructor category duration thumbnail modules.lessons._id modules.lessons.duration';

// GET /api/certificates — earned certificates plus courses still in progress
router.get('/', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name enrolledCourses').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const enrollments = (user.enrolledCourses || []).filter((e) => e.courseId);
    const courses = await Course.find({ _id: { $in: enrollments.map((e) => e.courseId) } })
      .select(COURSE_FIELDS)
      .lean();
    const byId = new Map(courses.map((c) => [String(c._id), c]));

    const certificates = [];
    const inProgress = [];

    await withSpan('certificates.list', { 'edu.enrollments': enrollments.length }, async () => {
      for (const enrollment of enrollments) {
        const course = byId.get(String(enrollment.courseId));
        if (!course) continue;
        const progress = completionFor(course, enrollment);
        if (progress.isComplete) {
          certificates.push(publicCertificate(await issueCertificate(user, course)));
        } else {
          inProgress.push({
            courseId: course._id,
            title: course.title,
            instructor: course.instructor,
            category: course.category,
            thumbnail: course.thumbnail,
            enrolledAt: enrollment.enrolledAt,
            ...progress
          });
        }
      }
    });

    certificates.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    inProgress.sort((a, b) => b.completionPercentage - a.completionPercentage);

    logEvent('certificates.listed', {
      'enduser.id': req.user.id,
      'certificates.earned': certificates.length,
      'certificates.in_progress': inProgress.length
    });
    res.json({ success: true, data: { certificates, inProgress } });
  } catch (error) {
    logger.error('Certificate list failed', { error, 'enduser.id': req.user?.id });
    res.status(500).json({ success: false, message: 'Could not load your certificates' });
  }
});

// GET /api/certificates/course/:courseId — certificate for a completed course
router.get('/course/:courseId', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course' });
    }

    const [user, course] = await Promise.all([
      User.findById(req.user.id).select('name enrolledCourses').lean(),
      Course.findById(courseId).select(COURSE_FIELDS).lean()
    ]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const enrollment = (user.enrolledCourses || []).find((e) => String(e.courseId) === courseId);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'You are not enrolled in this course' });
    }

    const progress = completionFor(course, enrollment);
    if (!progress.isComplete) {
      logEvent('certificate.locked', {
        'enduser.id': req.user.id,
        'course.id': courseId,
        'progress.completed_lessons': progress.completedLessons,
        'progress.total_lessons': progress.totalLessons
      });
      return res.status(403).json({
        success: false,
        code: 'COURSE_INCOMPLETE',
        message: `Finish every lesson to unlock your certificate (${progress.completedLessons} of ${progress.totalLessons} done)`,
        data: { ...progress, courseTitle: course.title }
      });
    }

    const cert = await issueCertificate(user, course);
    logEvent('certificate.viewed', { 'enduser.id': req.user.id, 'course.id': courseId, 'certificate.id': cert.certificateId });
    res.json({ success: true, data: { ...publicCertificate(cert), courseDuration: course.duration || '' } });
  } catch (error) {
    logger.error('Certificate load failed', { error, 'enduser.id': req.user?.id, 'course.id': req.params.courseId });
    res.status(500).json({ success: false, message: 'Could not load your certificate' });
  }
});

module.exports = router;
