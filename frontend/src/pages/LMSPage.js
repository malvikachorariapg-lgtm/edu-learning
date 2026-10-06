import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { getCourseById, getAllCourses, summarizeDocument, updateProgress } from '../services/api';
import AppShell from '../components/AppShell';
import { BRAND, SERVER_URL } from '../brand';
import './LMSPage.css';

const pad = (n) => String(n).padStart(2, '0');

const FAQS = [
  {
    q: 'What are the prerequisites for this course?',
    a: 'Basic knowledge of Python programming and fundamental mathematics is recommended. However, we cover all essential concepts from scratch, making it suitable for beginners.'
  },
  {
    q: 'How long do I have access to the course?',
    a: 'You get lifetime access to all course materials, including future updates and additions.'
  },
  {
    q: 'Will I receive a certificate upon completion?',
    a: 'Yes, you will receive a verified certificate of completion that you can share on LinkedIn and add to your resume.'
  },
  {
    q: 'What is the AI summary feature?',
    a: 'Our AI summary tool reads the lesson document and writes a concise summary for you, helping you quickly grasp key concepts and review materials efficiently.'
  },
  {
    q: 'Can I download the course materials?',
    a: 'Yes, all lesson documents and materials are available for download. However, video content is available for streaming only.'
  },
  {
    q: 'Is there any support available if I get stuck?',
    a: 'Yes, we provide discussion forums and email support. Our instructors and teaching assistants are available to help you with any questions or challenges.'
  }
];

// Field-agnostic; the specifics come from each course's own modules.
const REQUIREMENTS = [
  'A laptop and a steady internet connection',
  'About 6–8 hours a week for lessons and assignments',
  'Willingness to have your work reviewed — and to redo it'
];

// Inline **bold** support for summary text.
const renderInline = (text, keyBase) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>
  );

// Minimal markdown-ish renderer: headings, bullet / numbered lists, paragraphs.
const renderSummary = (text) => {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={`l-${blocks.length}`} className="lms-summary__list">
          {list.items.map((it, i) => {
            // "Term - definition" items get the term set in bold
            const term = it.match(/^([^-:*]{2,48}?)\s+[-–—:]\s+(.+)$/);
            return (
              <li key={i}>
                {term && !it.startsWith('**') ? (
                  <><strong>{term[1]}</strong> — {renderInline(term[2], `li-${blocks.length}-${i}`)}</>
                ) : renderInline(it, `li-${blocks.length}-${i}`)}
              </li>
            );
          })}
        </Tag>
      );
      list = null;
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    // "## Heading", or a short ALL-CAPS line such as "KEY POINTS" / "TAKEAWAYS:"
    const heading = line.match(/^#{1,6}\s+(.*)$/) ||
      (line.length <= 40 && /^[A-Z][A-Z0-9 &/'-]+:?$/.test(line) ? [line, line.replace(/:$/, '')] : null);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push(<h4 key={idx} className="lms-summary__head">{renderInline(heading[1], `h-${idx}`)}</h4>);
    } else if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet || numbered)[1]);
    } else {
      flush();
      blocks.push(<p key={idx}>{renderInline(line, `p-${idx}`)}</p>);
    }
  });
  flush();
  return blocks;
};

const thumbSrc = (course) => {
  if (!course.thumbnail) return null;
  return /^https?:\/\//.test(course.thumbnail) ? course.thumbnail : `${SERVER_URL}${course.thumbnail}`;
};

const LMSPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [courses, setCourses] = useState([]);
  const [course, setCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [showCourseList, setShowCourseList] = useState(!courseId);
  const [completedLessons, setCompletedLessons] = useState(new Set());
  const [currentCompletion, setCurrentCompletion] = useState(0);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(true);
  const [hasFetchedProgress, setHasFetchedProgress] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    // Get logged-in user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      // Load course after user is set
      if (courseId) {
        fetchCourse(parsedUser);
      } else {
        fetchAllCourses();
        setCheckingEnrollment(false);
      }
    } else {
      // No user logged in
      if (courseId) {
        fetchCourse(null);
      } else {
        fetchAllCourses();
        setCheckingEnrollment(false);
      }
    }

    // Cleanup function to reset state when course changes
    return () => {
      setHasFetchedProgress(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Keep the active tab visible when the tab strip scrolls horizontally (mobile)
  useEffect(() => {
    const el = document.querySelector('.lms-tab.is-active');
    const strip = el?.parentElement;
    if (el && strip && strip.scrollWidth > strip.clientWidth) {
      strip.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [activeTab]);

  const fetchAllCourses = async () => {
    try {
      setLoading(true);
      const response = await getAllCourses();
      setCourses(response.data.data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProgress = useCallback(async (userParam) => {
    // Prevent duplicate calls
    if (hasFetchedProgress) {
      console.log('Progress already fetched, skipping...');
      return;
    }

    try {
      setCheckingEnrollment(true);

      if (!userParam) {
        setIsEnrolled(false);
        setCheckingEnrollment(false);
        setHasFetchedProgress(true);
        return;
      }

      // If admin, skip enrollment check
      if (userParam.role === 'admin') {
        setIsEnrolled(true);
        setCheckingEnrollment(false);
        setHasFetchedProgress(true);
        console.log('Admin access granted');
        return;
      }

      // For students, fetch latest profile (only once)
      console.log('Fetching enrollment status for student...');
      const { getProfile } = await import('../services/api');
      const response = await getProfile(userParam.id);

      if (response.data.success) {
        const userProfile = response.data.user;
        const enrollment = userProfile.enrolledCourses?.find(
          ec => ec.courseId?._id === courseId || ec.courseId === courseId
        );

        if (enrollment) {
          setIsEnrolled(true);
          setCurrentCompletion(enrollment.completionPercentage || 0);
          // Mark completed lessons
          const completed = new Set();
          enrollment.progress?.forEach(p => {
            completed.add(`${p.moduleId}-${p.lessonId}`);
          });
          setCompletedLessons(completed);
          console.log('Loaded existing progress:', enrollment.completionPercentage + '%');
        } else {
          setIsEnrolled(false);
          console.log('User not enrolled in this course');
        }
      }

      setHasFetchedProgress(true);
    } catch (error) {
      console.error('Error loading user progress:', error);
      setIsEnrolled(false);
      setHasFetchedProgress(true);
    } finally {
      setCheckingEnrollment(false);
    }
  }, [courseId, hasFetchedProgress]);

  const fetchCourse = useCallback(async (userParam = null) => {
    try {
      setLoading(true);
      const response = await getCourseById(courseId);
      const courseData = response.data.data;
      setCourse(courseData);
      setShowCourseList(false);

      // Load user's existing progress
      const currentUser = userParam || user;
      if (currentUser) {
        await loadUserProgress(currentUser);
      } else {
        setCheckingEnrollment(false);
        setIsEnrolled(false);
      }

      // Select first lesson by default
      if (courseData.modules && courseData.modules.length > 0) {
        const firstModule = courseData.modules[0];
        setActiveModule(firstModule._id);
        if (firstModule.lessons && firstModule.lessons.length > 0) {
          setSelectedLesson({
            ...firstModule.lessons[0],
            moduleId: firstModule._id,
            moduleTitle: firstModule.title
          });
        }
      }
    } catch (error) {
      console.error('Error fetching course:', error);
      setCheckingEnrollment(false);
    } finally {
      setLoading(false);
    }
  }, [courseId, user, loadUserProgress]);

  const handleLessonClick = async (lesson, moduleId, moduleTitle) => {
    setSelectedLesson({
      ...lesson,
      moduleId,
      moduleTitle
    });
    setActiveModule(moduleId);
    setShowSummary(false);
    setSummary('');

    // Mark lesson as complete when clicked
    await markLessonComplete(moduleId, lesson._id);
  };

  const markLessonComplete = async (moduleId, lessonId) => {
    if (!user || !courseId) {
      console.log('User or courseId not available');
      return;
    }

    // Check if already completed
    const lessonKey = `${moduleId}-${lessonId}`;
    if (completedLessons.has(lessonKey)) {
      console.log('Lesson already marked as complete');
      return;
    }

    try {
      console.log('Marking lesson complete:', { courseId, moduleId, lessonId });
      const response = await updateProgress({
        userId: user.id,
        courseId: courseId,
        moduleId: moduleId,
        lessonId: lessonId
      });

      if (response.data.success) {
        console.log('Progress updated:', response.data);
        setCompletedLessons(prev => new Set([...prev, lessonKey]));
        setCurrentCompletion(response.data.data.completionPercentage);

        // Show success notification
        const notification = document.createElement('div');
        notification.className = 'lms-toast';
        notification.setAttribute('role', 'status');
        notification.innerHTML = `
          <span class="lms-toast__label">Lesson complete</span>
          <span class="lms-toast__value">Progress ${response.data.data.completionPercentage}%</span>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      if (error.response?.status === 400 && error.response?.data?.message?.includes('already completed')) {
        setCompletedLessons(prev => new Set([...prev, lessonKey]));
      }
    }
  };

  const handleSummarize = async () => {
    if (!selectedLesson || !selectedLesson.document) {
      alert('No document available for this lesson');
      return;
    }

    setSummarizing(true);
    try {
      const response = await summarizeDocument({
        courseId: course._id,
        moduleId: selectedLesson.moduleId,
        lessonId: selectedLesson._id
      });

      if (response.data.success) {
        setSummary(response.data.data.summary);
        setShowSummary(true);
      } else if (response.data.testMode) {
        setSummary(response.data.summary);
        setShowSummary(true);
      }
    } catch (error) {
      console.error('Error summarizing:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setSummarizing(false);
    }
  };

  const getEmbedUrl = (url) => {
    if (!url) return '';

    // Videos hosted on our own backend (e.g. /public/videos/intro.mp4)
    if (url.startsWith('/')) return `${SERVER_URL}${url}`;

    // Handle Google Drive URLs
    if (url.includes('drive.google.com')) {
      // Extract file ID from various Google Drive URL formats
      let fileId = null;

      // Format 1: /d/FILE_ID/view
      const match1 = url.match(/\/d\/(.*?)\//);
      if (match1) fileId = match1[1];

      // Format 2: /file/d/FILE_ID
      const match2 = url.match(/\/file\/d\/(.*?)(\/|$)/);
      if (match2) fileId = match2[1];

      // Format 3: id=FILE_ID
      const match3 = url.match(/[?&]id=([^&]+)/);
      if (match3) fileId = match3[1];

      if (fileId) {
        // Return preview URL for iframe embed
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }

    // Handle YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return url; // ReactPlayer handles YouTube URLs
    }

    // Handle direct video files (mp4, webm, etc.)
    if (url.match(/\.(mp4|webm|ogg|mov)$/i)) {
      return url;
    }

    // Return as-is for other formats
    return url;
  };

  const isAdmin = user?.role === 'admin';
  const nav = [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'classroom', label: 'Classroom', to: '/lms', active: true },
    { key: 'programs', label: 'Programs', to: '/courses' },
    ...(isAdmin ? [{ key: 'admin', label: 'Admin panel', to: '/admin-upload' }] : [])
  ];

  if (loading) {
    return (
      <AppShell nav={nav} eyebrow="Classroom" title="Loading">
        <div className="edu-loading">
          <div className="edu-spinner" role="status" aria-label="Loading" />
          <p className="edu-label">Opening the classroom</p>
        </div>
      </AppShell>
    );
  }

  // Show course list if no course is selected
  if (showCourseList) {
    return (
      <AppShell
        nav={nav}
        eyebrow="Classroom"
        title={<>Choose a <em>program</em></>}
      >
        <div className="lms-list">
          <header className="lms-list__head">
            <div>
              <p className="edu-label edu-label--accent">The classroom</p>
              <h2 className="lms-list__title">Pick up <em>where</em> you left off.</h2>
            </div>
            <p className="lms-list__count">
              <strong>{pad(courses.length)}</strong>
              <span className="edu-label">Programs live</span>
            </p>
          </header>

          {courses.length === 0 ? (
            <div className="edu-empty lms-list__empty">
              <h3 className="edu-h3">No courses available yet</h3>
              <p className="edu-muted">Please check back later or contact support.</p>
              <button className="edu-btn" onClick={() => navigate('/')}>Go to home</button>
            </div>
          ) : (
            <ol className="lms-list__rows">
              {courses.map((c, i) => (
                <li key={c._id}>
                  <button className="lms-row" onClick={() => navigate(`/lms/${c._id}`)}>
                    <span className="lms-row__num">{pad(i + 1)}</span>
                    <span className="lms-row__thumb">
                      {thumbSrc(c) ? (
                        <img
                          src={thumbSrc(c)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                        />
                      ) : null}
                    </span>
                    <span className="lms-row__main">
                      <span className="edu-label">{c.category}</span>
                      <span className="lms-row__title">{c.title}</span>
                      <span className="lms-row__desc">{c.description}</span>
                    </span>
                    <span className="lms-row__price">₹{Number(c.price || 0).toLocaleString('en-IN')}</span>
                    <span className="lms-row__go" aria-hidden="true"><i className="bi bi-arrow-right" /></span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell nav={nav} eyebrow="Classroom" title="Not found">
        <div className="edu-empty lms-list__empty">
          <h3 className="edu-h3">Course <em>not found</em></h3>
          <p className="edu-muted">The program you are looking for does not exist or was removed.</p>
          <button className="edu-btn" onClick={() => navigate('/lms')}>View all courses</button>
        </div>
      </AppShell>
    );
  }

  const modules = course.modules || [];
  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const canAccess = isEnrolled || isAdmin;
  const locked = !checkingEnrollment && !canAccess;
  const courseComplete = canAccess && !checkingEnrollment && currentCompletion >= 100;

  // Flattened lesson order for prev / next navigation
  const flat = [];
  modules.forEach((m, mi) => {
    m.lessons.forEach((l, li) => {
      flat.push({ lesson: l, moduleId: m._id, moduleTitle: m.title, mi, li });
    });
  });
  const currentIndex = selectedLesson
    ? flat.findIndex(f => f.lesson._id === selectedLesson._id && f.moduleId === selectedLesson.moduleId)
    : -1;
  const current = currentIndex >= 0 ? flat[currentIndex] : null;
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null;

  const goTo = (entry) => {
    if (!entry) return;
    handleLessonClick(entry.lesson, entry.moduleId, entry.moduleTitle);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const outline = (
    <div className="lms-outline">
      <div className="lms-outline__head">
        <p className="edu-label edu-label--ink">Course outline</p>
        <p className="edu-label">{pad(modules.length)} modules · {pad(totalLessons)} lessons</p>
      </div>
      {canAccess && (
        <div className="lms-outline__progress">
          <div className="edu-progress">
            <div className="edu-progress__bar edu-progress__bar--accent" style={{ width: `${currentCompletion}%` }} />
          </div>
          <span className="edu-label">{currentCompletion}% done</span>
        </div>
      )}
      {canAccess && !checkingEnrollment && (
        <div className="lms-outline__ctas">
          {courseComplete && (
            <button className="edu-btn edu-btn--accent edu-btn--sm edu-btn--block" onClick={() => navigate(`/certificates/${courseId}`)}>
              Get your certificate <span aria-hidden="true">→</span>
            </button>
          )}
          <button className="edu-btn edu-btn--ghost edu-btn--sm edu-btn--block" onClick={() => navigate(`/lms/${courseId}/quiz`)}>
            Take the quiz <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {modules.map((module, mi) => {
        const open = activeModule === module._id;
        return (
          <div key={module._id} className={`lms-mod${open ? ' is-open' : ''}`}>
            <button
              className="lms-mod__head"
              onClick={() => setActiveModule(open ? null : module._id)}
              aria-expanded={open}
            >
              <span className="lms-mod__num">M{pad(mi + 1)}</span>
              <span className="lms-mod__title">{module.title}</span>
              <span className="lms-mod__sign" aria-hidden="true">{open ? '−' : '+'}</span>
            </button>
            {open && (
              <ol className="lms-mod__lessons">
                {module.lessons.map((lesson, li) => {
                  const lessonKey = `${module._id}-${lesson._id}`;
                  const isCompleted = completedLessons.has(lessonKey);
                  const isCurrent = selectedLesson?._id === lesson._id;
                  return (
                    <li key={lesson._id}>
                      <button
                        className={`lms-les${isCurrent && canAccess ? ' is-current' : ''}${isCompleted ? ' is-done' : ''}`}
                        onClick={() => canAccess && handleLessonClick(lesson, module._id, module.title)}
                        disabled={!canAccess}
                        aria-current={isCurrent ? 'true' : undefined}
                      >
                        <span className="lms-les__num">{pad(mi + 1)}.{pad(li + 1)}</span>
                        <span className="lms-les__title">
                          {lesson.title}
                          {lesson.document && <span className="lms-les__doc">Doc</span>}
                        </span>
                        <span className="lms-les__meta">
                          {!canAccess ? (
                            <i className="bi bi-lock-fill" aria-label="Locked" />
                          ) : isCompleted ? (
                            <span className="lms-les__check" aria-label="Completed"><i className="bi bi-check-lg" /></span>
                          ) : (
                            lesson.duration || ''
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );

  const tabs = [
    ['overview', 'Overview'],
    ['resources', 'Resources'],
    ['summary', 'AI summary'],
    ['faculty', 'Faculty'],
    ['faq', 'FAQ']
  ];

  const lockedNote = (
    <p className="lms-note lms-note--lock">
      <i className="bi bi-lock-fill" aria-hidden="true" />
      Enroll in this program to open lesson resources and AI summaries.
    </p>
  );

  return (
    <AppShell
      nav={nav}
      eyebrow={`Classroom · ${course.category || BRAND.short}`}
      title={course.title}
      sidebarExtra={outline}
      actions={
        <button
          className="edu-btn edu-btn--ghost edu-btn--sm lms-back"
          aria-label="All courses"
          onClick={() => {
            setCourse(null);
            setShowCourseList(true);
            navigate('/lms');
          }}
        >
          <span aria-hidden="true">←</span> <span className="lms-back__text">All courses</span>
        </button>
      }
    >
      <div className="lms-room">
        {/* ---------- Stage: player or lock ---------- */}
        {checkingEnrollment ? (
          <div className="lms-stage lms-stage--wait">
            <div className="edu-spinner" role="status" aria-label="Verifying enrollment" />
            <p className="edu-label">Verifying enrollment</p>
          </div>
        ) : locked ? (
          <section className="lms-lock edu-pop">
            <div className="lms-lock__left">
              <span className="lms-lock__badge"><i className="bi bi-lock-fill" aria-hidden="true" /> Locked</span>
              <h2 className="lms-lock__title">This room is <em>reserved</em>.</h2>
              <p className="lms-lock__copy">
                You need to enroll in this course to access the content. Get lifetime access to all
                course materials, video lectures, and certificates.
              </p>
              <ul className="lms-lock__perks">
                <li><i className="bi bi-check-lg" aria-hidden="true" />{pad(totalLessons)} video lessons</li>
                <li><i className="bi bi-check-lg" aria-hidden="true" />AI lesson summaries</li>
                <li><i className="bi bi-check-lg" aria-hidden="true" />Certificate</li>
              </ul>
            </div>
            <div className="lms-lock__right">
              <p className="edu-label">One-time payment</p>
              <p className="lms-lock__price"><span>₹</span>{Number(course.price || 0).toLocaleString('en-IN')}</p>
              <p className="lms-lock__fine">Lifetime access · no subscription</p>
              <button className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block" onClick={() => navigate(`/payment/${courseId}`)}>
                Enroll now <i className="bi bi-arrow-right" aria-hidden="true" />
              </button>
              <button className="edu-link lms-lock__details" onClick={() => setActiveTab('overview')}>
                View course details
              </button>
            </div>
          </section>
        ) : selectedLesson ? (
          <section className="lms-stage">
            <div className="lms-player">
              {selectedLesson.videoUrl?.includes('drive.google.com') ? (
                // Use iframe for Google Drive videos
                <iframe
                  src={getEmbedUrl(selectedLesson.videoUrl)}
                  width="100%"
                  height="100%"
                  allow="autoplay"
                  style={{ border: 'none' }}
                  title={selectedLesson.title}
                ></iframe>
              ) : (
                // Use ReactPlayer for other video sources
                <ReactPlayer
                  src={getEmbedUrl(selectedLesson.videoUrl)}
                  controls
                  width="100%"
                  height="100%"
                />
              )}
            </div>
            <div className="lms-caption">
              <span className="lms-caption__live"><i className="bi bi-play-fill" aria-hidden="true" /> Now playing</span>
              <span>M{pad((current?.mi ?? 0) + 1)} · L{pad((current?.li ?? 0) + 1)}</span>
              {selectedLesson.duration && <span>{selectedLesson.duration}</span>}
              {completedLessons.has(`${selectedLesson.moduleId}-${selectedLesson._id}`) ? (
                <span className="lms-caption__status is-done"><i className="bi bi-check-lg" aria-hidden="true" /> Completed</span>
              ) : (
                <span className="lms-caption__status">In progress</span>
              )}
            </div>
          </section>
        ) : (
          <div className="lms-stage lms-stage--wait">
            <p className="edu-h3">Welcome to <em>{course.title}</em></p>
            <p className="edu-muted">Select a lesson from the outline to begin.</p>
          </div>
        )}

        {/* ---------- Lesson heading ---------- */}
        <header className={`lms-head${locked ? ' lms-head--locked' : ''}`}>
          <div className="lms-head__text">
            <p className="edu-label">
              {canAccess && selectedLesson ? selectedLesson.moduleTitle : `${pad(modules.length)} modules · ${pad(totalLessons)} lessons`}
            </p>
            <h2 className="lms-head__title">
              {canAccess && selectedLesson ? selectedLesson.title : course.title}
            </h2>
          </div>
          {canAccess && !checkingEnrollment && (
            <div className="lms-head__progress">
              <span className="lms-head__pct">{currentCompletion}<small>%</small></span>
              <span className="lms-head__bar" aria-hidden="true">
                <span style={{ width: `${currentCompletion}%` }} />
              </span>
              <span className="edu-label">Program complete</span>
            </div>
          )}
        </header>

        {courseComplete && (
          <div className="lms-done edu-pop">
            <span className="lms-done__icon" aria-hidden="true"><i className="bi bi-patch-check-fill" /></span>
            <div className="lms-done__text">
              <p className="edu-label edu-label--accent">Program complete</p>
              <p className="lms-done__title">Every lesson done. Your certificate is <em>ready</em>.</p>
            </div>
            <button className="edu-btn edu-btn--accent lms-done__btn" onClick={() => navigate(`/certificates/${courseId}`)}>
              Get your certificate <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {/* ---------- Mobile outline ---------- */}
        <details className="lms-mobile-outline">
          <summary>
            <span>Course outline</span>
            <span className="edu-label">{pad(totalLessons)} lessons</span>
          </summary>
          {outline}
        </details>

        {/* ---------- Tabs ---------- */}
        <div className="lms-tabs" role="tablist">
          {tabs.map(([key, label], i) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              className={`lms-tab${activeTab === key ? ' is-active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              <span className="lms-tab__num">{pad(i + 1)}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="lms-panel">
          {activeTab === 'overview' && (
            <div className="lms-overview">
              <div className="lms-overview__main">
                {canAccess && selectedLesson?.description && (
                  <div className="lms-block">
                    <p className="edu-label edu-label--accent">This lesson</p>
                    <p className="lms-prose">{selectedLesson.description}</p>
                  </div>
                )}
                <div className="lms-block">
                  <p className="edu-label">About this course</p>
                  <p className="lms-lead">{course.description}</p>
                </div>
                <div className="lms-block">
                  <p className="edu-label">What you'll learn</p>
                  <ol className="lms-numlist">
                    {modules.map((m, i) => (
                      <li key={m._id || i}><span>{pad(i + 1)}</span>{m.description || m.title}</li>
                    ))}
                  </ol>
                </div>
                <div className="lms-block">
                  <p className="edu-label">Requirements</p>
                  <ul className="lms-dashlist">
                    {REQUIREMENTS.map(r => <li key={r}>{r}</li>)}
                  </ul>
                </div>
                <div className="lms-block">
                  <p className="edu-label">Course features</p>
                  <div className="lms-features">
                    <div><i className="bi bi-grid-3x3-gap-fill" aria-hidden="true" /><strong>Comprehensive content</strong><span>{modules.length} modules covering all essential topics</span></div>
                    <div><i className="bi bi-play-btn-fill" aria-hidden="true" /><strong>Video lectures</strong><span>High-quality video content for each lesson</span></div>
                    <div><i className="bi bi-lightning-charge-fill" aria-hidden="true" /><strong>AI summaries</strong><span>Get instant AI summaries of course materials</span></div>
                    <div><i className="bi bi-file-earmark-text-fill" aria-hidden="true" /><strong>Study materials</strong><span>Downloadable documents and resources</span></div>
                  </div>
                </div>
              </div>
              <aside className="lms-facts edu-pop">
                <p className="edu-label edu-label--ink">Course information</p>
                <dl>
                  <div><dt>Duration</dt><dd>{course.duration || 'Self-paced'}</dd></div>
                  <div><dt>Level</dt><dd>Beginner to Intermediate</dd></div>
                  <div><dt>Modules</dt><dd>{pad(modules.length)}</dd></div>
                  <div><dt>Lessons</dt><dd>{pad(totalLessons)}</dd></div>
                  <div><dt>Certificate</dt><dd>Yes</dd></div>
                </dl>
                {canAccess && !checkingEnrollment && (
                  <div className="lms-facts__quiz">
                    <p className="lms-facts__quiz-copy">Five questions on this program. Check what stuck — retake any time.</p>
                    <button className="edu-btn edu-btn--accent edu-btn--sm edu-btn--block" onClick={() => navigate(`/lms/${courseId}/quiz`)}>
                      Take the quiz <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </aside>
            </div>
          )}

          {activeTab === 'resources' && (
            locked ? lockedNote : (
              <div>
                <p className="edu-label lms-panel__intro">Files attached to this lesson</p>
                {selectedLesson?.document ? (
                  <div className="lms-res">
                    <span className="lms-res__type">{(selectedLesson.document.filename || 'doc').split('.').pop().slice(0, 4)}</span>
                    <span className="lms-res__main">
                      <strong>Lesson document</strong>
                      <span>{selectedLesson.document.filename}</span>
                    </span>
                    <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => setActiveTab('summary')}>
                      Summarise <span aria-hidden="true">→</span>
                    </button>
                  </div>
                ) : (
                  <p className="lms-note">No documents are attached to this lesson.</p>
                )}
              </div>
            )
          )}

          {activeTab === 'summary' && (
            locked ? lockedNote : (
              <div className="lms-ai edu-pop">
                <div className="lms-ai__bar">
                  <span className="lms-ai__icon" aria-hidden="true"><i className="bi bi-lightning-charge-fill" /></span>
                  <div className="lms-ai__meta">
                    <p className="edu-label edu-label--accent">AI summary</p>
                    <h3 className="lms-ai__title">
                      {showSummary && summary ? <>The <em>short</em> version.</> : <>Read less. <em>Get more.</em></>}
                    </h3>
                    <p className="lms-ai__file">
                      {selectedLesson?.document ? (
                        <><i className="bi bi-file-earmark-text" aria-hidden="true" /> {selectedLesson.document.filename}</>
                      ) : 'This lesson has no document to summarise.'}
                    </p>
                  </div>
                  <button
                    className="edu-btn edu-btn--accent edu-btn--lg lms-ai__btn"
                    onClick={handleSummarize}
                    disabled={summarizing || !selectedLesson?.document}
                  >
                    {summarizing ? (
                      <><span className="lms-btn-spin" aria-hidden="true" /> Summarising…</>
                    ) : showSummary && summary ? 'Regenerate' : 'Summarise'}
                  </button>
                </div>
                {showSummary && summary ? (
                  <article className="lms-summary">{renderSummary(summary)}</article>
                ) : selectedLesson?.document && !summarizing ? (
                  <p className="lms-ai__hint">
                    Generate a short, structured digest of the lesson document. It takes a few seconds.
                  </p>
                ) : null}
                {summarizing && (
                  <div className="lms-summary lms-summary--wait" role="status" aria-label="Generating summary">
                    <span /><span /><span /><span />
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'faculty' && (
            <div className="lms-faculty">
              <article className="lms-person">
                <span className="lms-person__num" aria-hidden="true">
                  {(course.instructor || 'Edu Learning').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3 className="edu-h3">{course.instructor || 'Edu Learning faculty'}</h3>
                  <p className="edu-label">Lead mentor</p>
                  <p className="lms-prose">
                    Your mentor designs the briefs for this program, runs the weekly live class and studio hour,
                    and reviews your submitted work line by line. Questions about a lesson go to them first.
                  </p>
                </div>
              </article>
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="lms-faq">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q} className={`lms-faq__item${open ? ' is-open' : ''}`}>
                    <button
                      className="lms-faq__q"
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      aria-expanded={open}
                    >
                      <span className="lms-faq__num">{pad(i + 1)}</span>
                      <span className="lms-faq__text">{f.q}</span>
                      <span className="lms-faq__sign" aria-hidden="true">{open ? '−' : '+'}</span>
                    </button>
                    {open && <div className="lms-faq__a">{f.a}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------- Prev / next ---------- */}
        {canAccess && !checkingEnrollment && current && (
          <nav className="lms-step" aria-label="Lesson navigation">
            <button className="lms-step__btn lms-step__btn--prev" onClick={() => goTo(prev)} disabled={!prev}>
              <span className="lms-step__arrow" aria-hidden="true"><i className="bi bi-arrow-left" /></span>
              <span className="lms-step__text">
                <span className="lms-step__label">Previous</span>
                <span className="lms-step__title">{prev ? prev.lesson.title : 'Start of course'}</span>
              </span>
            </button>
            <button className="lms-step__btn lms-step__btn--next" onClick={() => goTo(next)} disabled={!next}>
              <span className="lms-step__text">
                <span className="lms-step__label">Up next</span>
                <span className="lms-step__title">{next ? next.lesson.title : 'End of course'}</span>
              </span>
              <span className="lms-step__arrow" aria-hidden="true"><i className="bi bi-arrow-right" /></span>
            </button>
          </nav>
        )}
      </div>
    </AppShell>
  );
};

export default LMSPage;
