import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoursesForAdmin, uploadDocument, createCourse, updateCourse, deleteCourse, getAnalytics, getStudentProgress } from '../services/api';
import AppShell from '../components/AppShell';
import { CATEGORIES } from '../brand';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manage');
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedLesson, setSelectedLesson] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Check if user is admin
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/auth');
      return;
    }
    
    const user = JSON.parse(userData);
    if (user.role !== 'admin') {
      alert('Access denied! Admin only.');
      navigate('/dashboard');
    }
  }, [navigate]);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [studentProgressData, setStudentProgressData] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);

  // Course form state
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    instructor: 'Edu Learning',
    price: 500,
    category: 'technology',
    duration: '',
    thumbnail: ''
  });

  useEffect(() => {
    // Non-admins are redirected by the check above; don't hit admin-only APIs
    if (JSON.parse(localStorage.getItem('user') || 'null')?.role !== 'admin') return;
    fetchCourses();
    if (activeTab === 'analytics') {
      fetchAnalytics();
      fetchStudentProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchCourses = async () => {
    try {
      const response = await getCoursesForAdmin();
      setCourses(response.data.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setMessage('Please login as admin to view analytics');
        setMessageType('danger');
        return;
      }

      console.log('Fetching analytics with JWT token...');
      const response = await getAnalytics();

      if (response.data.success) {
        console.log('Analytics data received:', response.data.data);
        setAnalyticsData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setMessage(error.response?.data?.message || 'Failed to load analytics data');
      setMessageType('danger');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchStudentProgress = async () => {
    try {
      setProgressLoading(true);
      const response = await getStudentProgress();
      if (response.data.success) {
        console.log('Student progress data received:', response.data.data);
        setStudentProgressData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching student progress:', error);
    } finally {
      setProgressLoading(false);
    }
  };

  const handleCourseChange = (e) => {
    setSelectedCourse(e.target.value);
    setSelectedModule('');
    setSelectedLesson('');
  };

  const handleModuleChange = (e) => {
    setSelectedModule(e.target.value);
    setSelectedLesson('');
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setMessage('Please select a PDF file');
        setMessageType('danger');
        setFile(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setMessage('File size should be less than 10MB');
        setMessageType('danger');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedCourse || !selectedModule || !selectedLesson || !file) {
      setMessage('Please fill all fields and select a file');
      setMessageType('danger');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('courseId', selectedCourse);
      formData.append('moduleId', selectedModule);
      formData.append('lessonId', selectedLesson);
      formData.append('document', file);

      const response = await uploadDocument(formData);
      
      if (response.data.success) {
        setMessage('Document uploaded successfully!');
        setMessageType('success');
        setSelectedCourse('');
        setSelectedModule('');
        setSelectedLesson('');
        setFile(null);
        document.getElementById('fileInput').value = '';
        fetchCourses();
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(error.response?.data?.message || 'Failed to upload document');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      await deleteCourse(courseId);
      setMessage('Course deleted successfully!');
      setMessageType('success');
      fetchCourses();
    } catch (error) {
      console.error('Delete error:', error);
      setMessage(error.response?.data?.message || 'Failed to delete course');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      description: course.description,
      instructor: course.instructor || 'Edu Learning',
      price: course.price || 500,
      category: course.category || 'technology',
      duration: course.duration || '',
      thumbnail: course.thumbnail || ''
    });
    setShowCourseModal(true);
  };

  const handleAddCourse = () => {
    setEditingCourse(null);
    setCourseForm({
      title: '',
      description: '',
      instructor: 'Edu Learning',
      price: 500,
      category: 'technology',
      duration: '',
      thumbnail: ''
    });
    setShowCourseModal(true);
  };

  const handleCourseFormChange = (e) => {
    setCourseForm({
      ...courseForm,
      [e.target.name]: e.target.value
    });
  };

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const courseData = {
        ...courseForm,
        modules: editingCourse?.modules || []
      };

      if (editingCourse) {
        await updateCourse(editingCourse._id, courseData);
        setMessage('Course updated successfully!');
      } else {
        await createCourse(courseData);
        setMessage('Course created successfully!');
      }
      
      setMessageType('success');
      setShowCourseModal(false);
      fetchCourses();
    } catch (error) {
      console.error('Save error:', error);
      setMessage(error.response?.data?.message || 'Failed to save course');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const getCourse = () => courses.find(c => c._id === selectedCourse);
  const getModule = () => getCourse()?.modules.find(m => m._id === selectedModule);


  // ---- Presentation helpers (derived, read-only) ----
  const lessonCount = (course) =>
    course.modules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0;
  const docCount = (course) =>
    course.modules?.reduce(
      (acc, m) => acc + (m.lessons?.filter((l) => l.document).length || 0), 0
    ) || 0;
  const totalModules = courses.reduce((a, c) => a + (c.modules?.length || 0), 0);
  const totalLessons = courses.reduce((a, c) => a + lessonCount(c), 0);
  const totalDocs = courses.reduce((a, c) => a + docCount(c), 0);
  const pad = (n) => String(n).padStart(2, '0');
  const tone = (pct) => (pct >= 100 ? 'accent' : pct >= 70 ? 'forest' : pct >= 40 ? 'ochre' : 'danger');
  const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || key;
  const trendMax = Math.max(1, ...(analyticsData?.enrollmentTrends || []).map((t) => t.enrollments));

  const sections = {
    manage: { eyebrow: 'Operations / Catalogue', title: 'Courses' },
    upload: { eyebrow: 'Operations / Materials', title: 'Lesson documents' },
    analytics: { eyebrow: 'Operations / Reporting', title: 'Analytics' }
  };

  const nav = [
    { key: 'manage', label: 'Courses', active: activeTab === 'manage', onClick: () => setActiveTab('manage') },
    { key: 'upload', label: 'Upload documents', active: activeTab === 'upload', onClick: () => setActiveTab('upload') },
    { key: 'analytics', label: 'Analytics', active: activeTab === 'analytics', onClick: () => setActiveTab('analytics') },
    { key: 'site', label: 'View site', to: '/courses' }
  ];

  const topActions =
    activeTab === 'manage' ? (
      <button className="edu-btn edu-btn--accent edu-btn--sm" onClick={handleAddCourse}>
        New course
      </button>
    ) : activeTab === 'analytics' ? (
      <button
        className="edu-btn edu-btn--ghost edu-btn--sm"
        onClick={() => { fetchAnalytics(); fetchStudentProgress(); }}
        disabled={analyticsLoading}
      >
        Refresh
      </button>
    ) : null;

  return (
    <AppShell
      nav={nav}
      eyebrow={sections[activeTab].eyebrow}
      title={sections[activeTab].title}
      actions={topActions}
      sidebarExtra={
        <div className="adm-side-note">
          <p className="edu-label">Console</p>
          <p>Catalogue, lesson materials and learner reporting for {courses.length} programs.</p>
        </div>
      }
    >
      <div className="adm">
        {message && (
          <div
            className={`edu-alert ${messageType === 'success' ? 'edu-alert--success' : 'edu-alert--error'} adm-alert`}
            role="alert"
          >
            <span className="adm-alert__text">{message}</span>
            <button type="button" className="adm-alert__close" onClick={() => setMessage('')} aria-label="Dismiss">
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}

        {/* ---------------- Courses ---------------- */}
        {activeTab === 'manage' && (
          <section>
            <div className="adm-stats">
              <div className="adm-stat">
                <p className="edu-label">Courses</p>
                <div className="adm-stat__value">{pad(courses.length)}</div>
              </div>
              <div className="adm-stat">
                <p className="edu-label">Modules</p>
                <div className="adm-stat__value">{pad(totalModules)}</div>
              </div>
              <div className="adm-stat">
                <p className="edu-label">Lessons</p>
                <div className="adm-stat__value">{pad(totalLessons)}</div>
              </div>
              <div className="adm-stat">
                <p className="edu-label">Documents attached</p>
                <div className="adm-stat__value">{pad(totalDocs)}</div>
                <div className="adm-stat__note">of {totalLessons} lessons</div>
              </div>
            </div>

            <div className="adm-section-head">
              <span className="edu-label edu-label--accent">01</span>
              <h2 className="adm-section-head__title">Catalogue</h2>
              <span className="edu-label adm-section-head__meta">{courses.length} records</span>
            </div>

            {courses.length === 0 ? (
              <div className="edu-empty">
                <h3 className="edu-h3">No courses yet.</h3>
                <p className="edu-muted">Create the first program to start building the catalogue.</p>
                <button className="edu-btn edu-btn--accent" onClick={handleAddCourse}>New course</button>
              </div>
            ) : (
              <div className="adm-table-wrap adm-panel">
                <table className="edu-table adm-table adm-table--stack adm-table--courses">
                  <thead>
                    <tr>
                      <th className="adm-col-num">#</th>
                      <th>Course</th>
                      <th>Category</th>
                      <th className="adm-num">Modules</th>
                      <th className="adm-num">Lessons</th>
                      <th className="adm-num">Docs</th>
                      <th className="adm-num">Price</th>
                      <th className="adm-col-actions"><span className="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course, i) => (
                      <tr key={course._id}>
                        <td className="adm-col-num adm-mono">{pad(i + 1)}</td>
                        <td className="adm-course-cell">
                          <strong>{course.title}</strong>
                          <span>{course.instructor || 'Edu Learning'}</span>
                        </td>
                        <td data-label="Category">
                          <span className="edu-tag edu-tag--soft">{categoryLabel(course.category || 'technology')}</span>
                        </td>
                        <td className="adm-num adm-mono" data-label="Modules">{course.modules?.length || 0}</td>
                        <td className="adm-num adm-mono" data-label="Lessons">{lessonCount(course)}</td>
                        <td className="adm-num adm-mono" data-label="Docs">{docCount(course)}</td>
                        <td className="adm-num adm-mono" data-label="Price">₹{course.price || 500}</td>
                        <td className="adm-col-actions">
                          <div className="adm-row-actions">
                            <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => handleEditCourse(course)}>
                              Edit
                            </button>
                            <button className="edu-btn edu-btn--danger edu-btn--sm" onClick={() => handleDeleteCourse(course._id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ---------------- Upload ---------------- */}
        {activeTab === 'upload' && (
          <section className="adm-upload">
            <div className="adm-upload__intro">
              <p className="edu-label edu-label--accent">Attach a PDF</p>
              <h2 className="edu-h2">Give a lesson its <em>reading</em>.</h2>
              <p className="edu-body">
                Documents attached here appear inside the lesson. Learners can generate an AI summary from them.
              </p>
              <ol className="adm-steps">
                <li><span>01</span>Pick the course, module and lesson.</li>
                <li><span>02</span>Choose a PDF, 10 MB or smaller.</li>
                <li><span>03</span>Upload. An existing document is replaced.</li>
              </ol>
            </div>

            <form onSubmit={handleSubmit} className="edu-panel edu-pop adm-upload__form">
              <div className="edu-panel__head">
                <p className="edu-label edu-label--ink">Document upload</p>
                <span className="edu-label">PDF / 10 MB max</span>
              </div>
              <div className="edu-panel__body">
                <div className="edu-field">
                  <label htmlFor="adm-course">Course</label>
                  <select id="adm-course" className="edu-select" value={selectedCourse} onChange={handleCourseChange} required>
                    <option value="">Choose a course...</option>
                    {courses.map(course => (
                      <option key={course._id} value={course._id}>{course.title}</option>
                    ))}
                  </select>
                </div>

                <div className="adm-grid-2">
                  <div className="edu-field">
                    <label htmlFor="adm-module">Module</label>
                    <select
                      id="adm-module"
                      className="edu-select"
                      value={selectedModule}
                      onChange={handleModuleChange}
                      required
                      disabled={!selectedCourse}
                    >
                      <option value="">Choose a module...</option>
                      {getCourse()?.modules.map(module => (
                        <option key={module._id} value={module._id}>{module.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="edu-field">
                    <label htmlFor="adm-lesson">Lesson</label>
                    <select
                      id="adm-lesson"
                      className="edu-select"
                      value={selectedLesson}
                      onChange={(e) => setSelectedLesson(e.target.value)}
                      required
                      disabled={!selectedModule}
                    >
                      <option value="">Choose a lesson...</option>
                      {getModule()?.lessons.map(lesson => (
                        <option key={lesson._id} value={lesson._id}>
                          {lesson.title}{lesson.document ? ' (has document)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label htmlFor="fileInput" className={`adm-drop${file ? ' has-file' : ''}`}>
                  <input
                    type="file"
                    id="fileInput"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    required
                  />
                  <i className="bi bi-file-earmark-arrow-up adm-drop__icon" aria-hidden="true"></i>
                  <span className="adm-drop__title">{file ? 'Replace file' : 'Choose a PDF'}</span>
                  <span className="edu-label">Click to browse</span>
                </label>

                {file && (
                  <div className="adm-file-row">
                    <span className="adm-file-row__name">{file.name}</span>
                    <span className="adm-file-row__size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span className="edu-tag edu-tag--forest">Ready</span>
                  </div>
                )}

                <button type="submit" className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block adm-upload__submit" disabled={loading || !file}>
                  {loading ? (<><span className="edu-spinner adm-spinner-sm"></span>Uploading...</>) : 'Upload document'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ---------------- Analytics ---------------- */}
        {activeTab === 'analytics' && (
          <section>
            {analyticsLoading ? (
              <div className="edu-loading adm-loading">
                <div className="edu-spinner"></div>
                <p className="edu-label">Loading analytics</p>
              </div>
            ) : analyticsData ? (
              <>
                <div className="adm-stats">
                  <div className="adm-stat">
                    <p className="edu-label">Students</p>
                    <div className="adm-stat__value">{analyticsData.coreStats.totalStudents}</div>
                  </div>
                  <div className="adm-stat">
                    <p className="edu-label">Courses</p>
                    <div className="adm-stat__value">{analyticsData.coreStats.totalCourses}</div>
                  </div>
                  <div className="adm-stat">
                    <p className="edu-label">Enrollments</p>
                    <div className="adm-stat__value">{analyticsData.coreStats.totalEnrollments}</div>
                  </div>
                  <div className="adm-stat adm-stat--accent">
                    <p className="edu-label">Revenue</p>
                    <div className="adm-stat__value">₹{Number(analyticsData.coreStats.totalRevenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>

                {/* Student progress */}
                <div className="adm-section-head">
                  <span className="edu-label edu-label--accent">01</span>
                  <h2 className="adm-section-head__title">Student progress</h2>
                  <span className="edu-label adm-section-head__meta">{studentProgressData.length} learners</span>
                </div>
                {progressLoading ? (
                  <div className="adm-inline-loading"><span className="edu-spinner adm-spinner-sm"></span><span className="edu-label">Loading student data</span></div>
                ) : studentProgressData.length > 0 ? (
                  <div className="adm-table-wrap adm-panel">
                    <table className="edu-table adm-table adm-table--stack">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th className="adm-num">Enrolled</th>
                          <th>Avg. completion</th>
                          <th>Courses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentProgressData.map((student) => (
                          <tr key={student.studentId}>
                            <td className="adm-course-cell">
                              <strong>{student.studentName}</strong>
                              <span className="adm-mono">{student.studentEmail}</span>
                            </td>
                            <td className="adm-num adm-mono" data-label="Enrolled">{student.totalEnrollments}</td>
                            <td data-label="Avg. completion">
                              <div className="adm-meter">
                                <div className="edu-progress adm-meter__bar">
                                  <div className={`edu-progress__bar adm-fill--${tone(student.averageCompletion)}`} style={{ width: `${student.averageCompletion}%` }}></div>
                                </div>
                                <span className="adm-mono adm-meter__val">{student.averageCompletion}%</span>
                              </div>
                            </td>
                            <td data-label="Courses">
                              {student.courses.length > 0 ? (
                                <ul className="adm-sublist">
                                  {student.courses.map((course, idx) => (
                                    <li key={idx}>
                                      <span className="adm-sublist__name">{course.courseName}</span>
                                      <span className={`adm-mono adm-pct adm-pct--${tone(course.completionPercentage)}`}>{course.completionPercentage}%</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="edu-muted">No enrollments</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="edu-empty"><p className="edu-muted">No student data available.</p></div>
                )}

                <div className="adm-grid-2 adm-grid-2--wide">
                  {/* Popularity */}
                  <div>
                    <div className="adm-section-head">
                      <span className="edu-label edu-label--accent">02</span>
                      <h2 className="adm-section-head__title">Most enrolled</h2>
                      <span className="edu-label adm-section-head__meta">Top 5</span>
                    </div>
                    {analyticsData.coursePopularity.length > 0 ? (
                      <ol className="adm-bars adm-panel">
                        {analyticsData.coursePopularity.map((course, index) => (
                          <li key={course.courseId}>
                            <div className="adm-bars__row">
                              <span className="adm-mono adm-bars__idx">{pad(index + 1)}</span>
                              <span className="adm-bars__name">{course.courseName}</span>
                              <span className="adm-mono adm-bars__val">{course.enrollments}</span>
                            </div>
                            <div className="edu-progress">
                              <div
                                className={`edu-progress__bar${index === 0 ? ' edu-progress__bar--accent' : ''}`}
                                style={{ width: `${(course.enrollments / analyticsData.coursePopularity[0].enrollments) * 100}%` }}
                              ></div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="edu-muted adm-none">No enrollment data available.</p>
                    )}
                  </div>

                  {/* Completion rates */}
                  <div>
                    <div className="adm-section-head">
                      <span className="edu-label edu-label--accent">03</span>
                      <h2 className="adm-section-head__title">Completion by course</h2>
                    </div>
                    {analyticsData.studentProgress.length > 0 ? (
                      <ol className="adm-bars adm-bars--scroll adm-panel">
                        {analyticsData.studentProgress.map((progress) => (
                          <li key={progress.courseId}>
                            <div className="adm-bars__row">
                              <span className="adm-bars__name">{progress.courseName}</span>
                              <span className="adm-mono adm-bars__val">{progress.completionPercentage}%</span>
                            </div>
                            <div className="edu-progress">
                              <div className={`edu-progress__bar adm-fill--${tone(progress.completionPercentage)}`} style={{ width: `${progress.completionPercentage}%` }}></div>
                            </div>
                            <span className="edu-label adm-bars__note">
                              Avg {progress.avgCompletedLessons} / {progress.totalLessons} lessons
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="edu-muted adm-none">No progress data available.</p>
                    )}
                  </div>
                </div>

                <div className="adm-grid-2 adm-grid-2--wide">
                  {/* Recent registrations */}
                  <div>
                    <div className="adm-section-head">
                      <span className="edu-label edu-label--accent">04</span>
                      <h2 className="adm-section-head__title">Recently registered</h2>
                    </div>
                    {analyticsData.recentActivity.length > 0 ? (
                      <div className="adm-table-wrap adm-panel">
                        <table className="edu-table adm-table adm-table--stack adm-table--compact">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th className="adm-num">Courses</th>
                              <th className="adm-num">Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analyticsData.recentActivity.map((student) => (
                              <tr key={student._id}>
                                <td className="adm-course-cell">
                                  <strong>{student.name}</strong>
                                  <span className="adm-mono">{student.email}</span>
                                </td>
                                <td className="adm-num adm-mono" data-label="Courses">{student.enrolledCoursesCount}</td>
                                <td className="adm-num adm-mono" data-label="Joined">{new Date(student.registeredAt).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="edu-muted adm-none">No recent registrations.</p>
                    )}
                  </div>

                  {/* Trends */}
                  <div>
                    <div className="adm-section-head">
                      <span className="edu-label edu-label--accent">05</span>
                      <h2 className="adm-section-head__title">Enrollments, last 7 days</h2>
                    </div>
                    {analyticsData.enrollmentTrends.length > 0 ? (
                      <ul className="adm-trend adm-panel">
                        {analyticsData.enrollmentTrends.map((trend) => (
                          <li key={trend.date}>
                            <span className="adm-mono adm-trend__date">{new Date(trend.date).toLocaleDateString()}</span>
                            <div className="edu-progress adm-trend__bar">
                              <div className="edu-progress__bar" style={{ width: `${(trend.enrollments / trendMax) * 100}%` }}></div>
                            </div>
                            <span className="adm-mono adm-trend__val">{trend.enrollments}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="edu-muted adm-none">No enrollment trends available.</p>
                    )}
                  </div>
                </div>

                <p className="edu-label adm-cache">
                  Cached for 30 min / Last updated {new Date(analyticsData.timestamp || Date.now()).toLocaleString()}
                </p>
              </>
            ) : (
              <div className="edu-empty">
                <h3 className="edu-h3">No analytics loaded.</h3>
                <p className="edu-muted">Fetch the latest numbers from the server.</p>
                <button className="edu-btn edu-btn--sm" onClick={fetchAnalytics}>Refresh analytics</button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ---------------- Course modal ---------------- */}
      {showCourseModal && (
        <div className="edu-modal-overlay adm-modal-overlay" onClick={() => setShowCourseModal(false)}>
          <div className="edu-modal edu-pop adm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="adm-modal-title">
            <form onSubmit={handleSaveCourse} className="adm-modal__form">
              <div className="edu-modal__head">
                <div>
                  <p className="edu-label">{editingCourse ? 'Edit record' : 'New record'}</p>
                  <h2 id="adm-modal-title" className="edu-h3">{editingCourse ? editingCourse.title : 'New course'}</h2>
                </div>
                <button type="button" className="edu-close" onClick={() => setShowCourseModal(false)} aria-label="Close">
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <div className="edu-modal__body adm-modal__body">
                <div className="edu-field">
                  <label htmlFor="cf-title">Course title *</label>
                  <input id="cf-title" type="text" className="edu-input" name="title" value={courseForm.title} onChange={handleCourseFormChange} required placeholder="e.g. Data Science Masterclass" />
                </div>

                <div className="edu-field">
                  <label htmlFor="cf-desc">Description *</label>
                  <textarea id="cf-desc" className="edu-textarea" name="description" value={courseForm.description} onChange={handleCourseFormChange} required rows="3" placeholder="Brief description of the course"></textarea>
                </div>

                <div className="adm-grid-2">
                  <div className="edu-field">
                    <label htmlFor="cf-instructor">Instructor</label>
                    <input id="cf-instructor" type="text" className="edu-input" name="instructor" value={courseForm.instructor} onChange={handleCourseFormChange} placeholder="Instructor name" />
                  </div>
                  <div className="edu-field">
                    <label htmlFor="cf-duration">Duration</label>
                    <input id="cf-duration" type="text" className="edu-input" name="duration" value={courseForm.duration} onChange={handleCourseFormChange} placeholder="e.g. 3 Months" />
                  </div>
                  <div className="edu-field">
                    <label htmlFor="cf-price">Price (₹) *</label>
                    <input id="cf-price" type="number" className="edu-input adm-mono" name="price" value={courseForm.price} onChange={handleCourseFormChange} required min="0" />
                  </div>
                  <div className="edu-field">
                    <label htmlFor="cf-category">Category *</label>
                    <select id="cf-category" className="edu-select" name="category" value={courseForm.category} onChange={handleCourseFormChange} required>
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="edu-field">
                  <label htmlFor="cf-thumb">Thumbnail URL</label>
                  <input id="cf-thumb" type="url" className="edu-input" name="thumbnail" value={courseForm.thumbnail} onChange={handleCourseFormChange} placeholder="https://example.com/image.jpg" />
                </div>

                {editingCourse && (
                  <div className="adm-outline">
                    <div className="adm-outline__head">
                      <p className="edu-label edu-label--ink">Syllabus</p>
                      <span className="edu-label">
                        {editingCourse.modules?.length || 0} modules / {lessonCount(editingCourse)} lessons
                      </span>
                    </div>
                    {editingCourse.modules?.length ? (
                      <ol className="adm-outline__modules">
                        {editingCourse.modules.map((m, mi) => (
                          <li key={m._id || mi} className="adm-outline__module">
                            <div className="adm-outline__mtitle">
                              <span className="adm-mono">{pad(mi + 1)}</span>
                              <strong>{m.title}</strong>
                            </div>
                            {m.lessons?.length > 0 && (
                              <ol className="adm-outline__lessons">
                                {m.lessons.map((l, li) => (
                                  <li key={l._id || li}>
                                    <span className="adm-mono">{mi + 1}.{li + 1}</span>
                                    <span className="adm-outline__ltitle">{l.title}</span>
                                    {l.document && <span className="edu-tag edu-tag--forest adm-outline__doc">PDF</span>}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="edu-muted adm-none">No modules in this course yet.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="edu-modal__foot">
                <button type="button" className="edu-btn edu-btn--ghost" onClick={() => setShowCourseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="edu-btn edu-btn--accent" disabled={loading}>
                  {loading ? 'Saving...' : editingCourse ? 'Update course' : 'Create course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default AdminDashboard;
