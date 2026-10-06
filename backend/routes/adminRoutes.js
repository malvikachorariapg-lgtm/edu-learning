const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiters');
const { cacheMiddleware, invalidateCourseCache } = require('../config/redis');
const { getAIConfig, getDocumentSummary, AIServiceError } = require('../services/aiService');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '.pdf');
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      const err = new Error('Only PDF files are allowed');
      err.status = 400;
      cb(err);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
    fields: 10
  }
});

// Wrap multer so upload errors return a clean 400 instead of a generic 500
const uploadDocumentFile = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Maximum size is 10MB.' : err.message;
    return res.status(400).json({ success: false, message });
  });
};

const removeFile = (filePath) => fs.promises.unlink(filePath).catch(() => {});

// All routes in this file require an admin, except summarize-document (any logged-in user)
const adminOnly = [verifyToken, isAdmin];

// Upload document to a lesson
router.post('/upload-document', adminOnly, uploadDocumentFile, async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!courseId || !moduleId || !lessonId) {
      // Delete uploaded file
      await removeFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Find the course
    const course = mongoose.isValidObjectId(courseId) ? await Course.findById(courseId) : null;
    if (!course) {
      await removeFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Find the module
    const module = course.modules.id(moduleId);
    if (!module) {
      await removeFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Find the lesson
    const lesson = module.lessons.id(lessonId);
    if (!lesson) {
      await removeFile(req.file.path);
      return res.status(404).json({
        success: false,
        message: 'Lesson not found'
      });
    }

    // Delete old document if exists
    if (lesson.document && lesson.document.filepath) {
      await removeFile(path.join(__dirname, '..', lesson.document.filepath));
    }

    // Update lesson with document info
    lesson.document = {
      filename: req.file.originalname,
      filepath: `uploads/${req.file.filename}`,
      uploadedAt: new Date()
    };

    await course.save();
    await invalidateCourseCache();

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        lessonId: lesson._id,
        document: lesson.document
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await removeFile(req.file.path);
    }

    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message
    });
  }
});

// Summarize document using AI (Vertex AI Gemini) - admins, or learners enrolled in the course
router.post('/summarize-document', verifyToken, aiLimiter, async (req, res) => {
  try {
    const { courseId, moduleId, lessonId } = req.body;

    if (!getAIConfig().enabled) {
      return res.status(503).json({
        success: false,
        message: 'AI summarization is currently disabled.'
      });
    }

    if (!courseId || !moduleId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    if (![courseId, moduleId, lessonId].every(id => mongoose.isValidObjectId(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course, module or lesson ID'
      });
    }

    // Learners can only summarise documents of programs they are enrolled in
    if (req.user.role !== 'admin') {
      const enrolled = await User.exists({ _id: req.user.id, 'enrolledCourses.courseId': courseId });
      if (!enrolled) {
        return res.status(403).json({
          success: false,
          message: 'Enroll in this course to use AI summaries'
        });
      }
    }

    // Only fetch the bits of the course tree we need
    const course = await Course.findById(courseId)
      .select('modules._id modules.lessons._id modules.lessons.title modules.lessons.document')
      .lean();
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const module = (course.modules || []).find(m => String(m._id) === String(moduleId));
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    const lesson = (module.lessons || []).find(l => String(l._id) === String(lessonId));
    if (!lesson || !lesson.document || !lesson.document.filepath) {
      return res.status(404).json({
        success: false,
        message: 'Document not found for this lesson'
      });
    }

    // Resolve the file and make sure it stays inside the uploads directory
    const filePath = path.resolve(__dirname, '..', lesson.document.filepath);
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document path'
      });
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (e) {
      return res.status(404).json({
        success: false,
        message: 'Document file not found on server'
      });
    }

    const { summary, cached } = await getDocumentSummary({
      documentId: `${lesson.document.filepath}:${stat.size}:${stat.mtimeMs}`,
      loadBuffer: () => fs.promises.readFile(filePath),
      meta: { lessonTitle: lesson.title, documentName: lesson.document.filename }
    });

    res.set('X-Summary-Cache', cached ? 'HIT' : 'MISS');
    res.json({
      success: true,
      data: {
        lessonTitle: lesson.title,
        documentName: lesson.document.filename,
        summary: summary
      }
    });
  } catch (error) {
    if (error instanceof AIServiceError) {
      console.error('AI summarization error:', error.message, error.details || '');
      return res.status(error.status).json({
        success: false,
        message: error.message,
        error: error.details || error.message
      });
    }

    console.error('Error summarizing document:', error);
    res.status(500).json({
      success: false,
      message: 'Error summarizing document',
      error: error.message
    });
  }
});

// Get all courses for admin
router.get('/courses', adminOnly, async (req, res) => {
  try {
    // Full documents: the admin editor round-trips every field (incl. lesson
    // videoUrls) on save, so a trimmed projection here would wipe data.
    const courses = await Course.find().sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      data: courses
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching courses',
      error: error.message
    });
  }
});

// Create new course
router.post('/courses', adminOnly, async (req, res) => {
  try {
    const courseData = req.body;
    const course = await Course.create(courseData);
    await invalidateCourseCache();
    res.json({
      success: true,
      message: 'Course created successfully',
      data: course
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating course',
      error: error.message
    });
  }
});

// Update course
router.put('/courses/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const course = await Course.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    await invalidateCourseCache();
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Course updated successfully',
      data: course
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Error updating course:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating course',
      error: error.message
    });
  }
});

// Delete course
router.delete('/courses/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    const course = await Course.findByIdAndDelete(id);
    await invalidateCourseCache();
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Delete associated documents
    if (course.modules) {
      for (const module of course.modules) {
        for (const lesson of module.lessons) {
          if (lesson.document && lesson.document.filepath) {
            await removeFile(path.join(__dirname, '..', lesson.document.filepath));
          }
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting course',
      error: error.message
    });
  }
});

// ============================================
// ANALYTICS DASHBOARD ENDPOINT (Protected)
// ============================================

// Analytics route with 30-minute cache
router.get('/analytics', verifyToken, isAdmin, cacheMiddleware(1800), async (req, res) => {
  try {
    console.log('📊 Fetching analytics data...');

    // 1. CORE STATS - Total counts
    const [totalStudents, totalCourses, totalEnrollments] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Course.countDocuments(),
      User.aggregate([
        { $unwind: '$enrolledCourses' },
        { $count: 'total' }
      ])
    ]);

    const enrollmentCount = totalEnrollments.length > 0 ? totalEnrollments[0].total : 0;

    // 2. COURSE POPULARITY - Top 5 most enrolled courses
    const coursePopularity = await User.aggregate([
      { $unwind: '$enrolledCourses' },
      { 
        $group: {
          _id: '$enrolledCourses.courseId',
          enrollments: { $sum: 1 }
        }
      },
      { $sort: { enrollments: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'courseInfo'
        }
      },
      { $unwind: '$courseInfo' },
      {
        $project: {
          _id: 1,
          courseName: '$courseInfo.title',
          enrollments: 1
        }
      }
    ]);

    // 3. STUDENT PROGRESS - Calculate average completion per course
    const studentProgress = await User.aggregate([
      { $unwind: '$enrolledCourses' },
      {
        $lookup: {
          from: 'courses',
          localField: 'enrolledCourses.courseId',
          foreignField: '_id',
          as: 'courseDetails'
        }
      },
      { $unwind: '$courseDetails' },
      {
        $project: {
          courseId: '$enrolledCourses.courseId',
          courseName: '$courseDetails.title',
          totalLessons: {
            $sum: {
              $map: {
                input: '$courseDetails.modules',
                as: 'module',
                in: { $size: '$$module.lessons' }
              }
            }
          },
          completedLessons: {
            $cond: {
              if: { $isArray: '$enrolledCourses.progress' },
              then: { $size: '$enrolledCourses.progress' },
              else: 0
            }
          }
        }
      },
      {
        $group: {
          _id: '$courseId',
          courseName: { $first: '$courseName' },
          totalLessons: { $first: '$totalLessons' },
          avgCompletedLessons: { $avg: '$completedLessons' }
        }
      },
      {
        $project: {
          _id: 1,
          courseName: 1,
          totalLessons: 1,
          avgCompletedLessons: { $round: ['$avgCompletedLessons', 1] },
          completionPercentage: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: {
                      if: { $eq: ['$totalLessons', 0] },
                      then: 0,
                      else: { $divide: ['$avgCompletedLessons', '$totalLessons'] }
                    }
                  },
                  100
                ]
              },
              1
            ]
          }
        }
      },
      { $sort: { completionPercentage: -1 } }
    ]);

    // 4. RECENT ACTIVITY - Last 5 registered students
    const recentStudents = await User.find({ role: 'student' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email createdAt enrolledCourses')
      .lean();

    const recentActivity = recentStudents.map(student => ({
      _id: student._id,
      name: student.name,
      email: student.email,
      registeredAt: student.createdAt,
      enrolledCoursesCount: student.enrolledCourses?.length || 0
    }));

    // 5. ENROLLMENT TRENDS - Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const enrollmentTrends = await User.aggregate([
      { $unwind: '$enrolledCourses' },
      {
        $match: {
          'enrolledCourses.enrolledAt': { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$enrolledCourses.enrolledAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: '$_id',
          enrollments: '$count',
          _id: 0
        }
      }
    ]);

    // 6. REVENUE DATA (if Payment model exists)
    let totalRevenue = 0;
    let recentPayments = [];

    try {
      const payments = await Payment.aggregate([
        { $match: { status: { $in: ['success', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      
      totalRevenue = payments.length > 0 ? payments[0].total : 0;

      recentPayments = await Payment.find({ status: { $in: ['success', 'completed'] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'name email')
        .populate('courseId', 'title')
        .select('amount createdAt')
        .lean();
    } catch (error) {
      console.log('Payment model not found or error:', error.message);
    }

    // Prepare response
    const analyticsData = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        coreStats: {
          totalStudents,
          totalCourses,
          totalEnrollments: enrollmentCount,
          totalRevenue
        },
        coursePopularity: coursePopularity.map(course => ({
          courseId: course._id,
          courseName: course.courseName,
          enrollments: course.enrollments
        })),
        studentProgress: studentProgress.map(progress => ({
          courseId: progress._id,
          courseName: progress.courseName,
          totalLessons: progress.totalLessons,
          avgCompletedLessons: progress.avgCompletedLessons,
          completionPercentage: progress.completionPercentage
        })),
        recentActivity,
        enrollmentTrends,
        recentPayments: recentPayments.map(payment => ({
          amount: payment.amount,
          student: payment.userId?.name || 'Unknown',
          course: payment.courseId?.title || 'Unknown',
          date: payment.createdAt
        }))
      }
    };

    console.log('✅ Analytics data fetched successfully');
    res.json(analyticsData);

  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics data',
      error: error.message
    });
  }
});

// Get detailed student progress with 15-minute cache
router.get('/student-progress', verifyToken, isAdmin, cacheMiddleware(900), async (req, res) => {
  try {
    console.log('Fetching detailed student progress...');

    const students = await User.find({ role: 'student' })
      .select('name email enrolledCourses')
      .populate('enrolledCourses.courseId', 'title')
      .lean();

    const studentProgressList = students.map(student => {
      const enrollments = student.enrolledCourses || [];
      const courses = enrollments.map(enrollment => ({
        courseId: enrollment.courseId?._id,
        courseName: enrollment.courseId?.title || 'Unknown Course',
        completionPercentage: enrollment.completionPercentage || 0,
        enrolledAt: enrollment.enrolledAt,
        progressCount: enrollment.progress?.length || 0
      }));

      return {
        studentId: student._id,
        studentName: student.name,
        studentEmail: student.email,
        totalEnrollments: enrollments.length,
        averageCompletion: enrollments.length > 0
          ? Math.round(
              enrollments.reduce((sum, e) => sum + (e.completionPercentage || 0), 0) / enrollments.length
            )
          : 0,
        courses: courses
      };
    });

    // Sort by average completion (descending)
    studentProgressList.sort((a, b) => b.averageCompletion - a.averageCompletion);

    res.json({
      success: true,
      data: studentProgressList
    });

  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching student progress',
      error: error.message
    });
  }
});

module.exports = router;

