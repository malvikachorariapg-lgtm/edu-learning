import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAllCourses, getProfile, updateSchedule } from '../services/api';
import AppShell from '../components/AppShell';
import { toast } from '../components/Toaster';
import { LEARNER_LINKS } from '../components/learnerNav';
import { isDashboardCacheFresh, readDashboardCache, writeDashboardCache } from '../services/dashboardCache';
import SchedulePlanner from '../components/SchedulePlanner';
import { daysInclusive, estimateHours, formatKey, localTodayKey, paceFor, toKey } from '../utils/schedule';
import { SERVER_URL, CATEGORIES } from '../brand';
import './StudentDashboard.css';

const FALLBACK_THUMB = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const shortDate = (d) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

// "15:30" -> 930 seconds, "1:02:10" -> 3730 seconds
const parseDuration = (str) => {
  if (!str || typeof str !== 'string') return 0;
  const parts = str.split(':').map((n) => parseInt(n, 10));
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

const formatHours = (seconds) => {
  if (!seconds) return '0';
  const h = seconds / 3600;
  return h < 10 ? h.toFixed(1) : Math.round(h).toString();
};

// Study plan -> what to show on the dashboard chip
const planInfo = (enrollment, course, pct) => {
  if (!enrollment.startDate || !enrollment.endDate) return null;
  const start = toKey(enrollment.startDate);
  const end = toKey(enrollment.endDate);
  const today = localTodayKey();
  const short = (k) => formatKey(k, { day: 'numeric', month: 'short' });

  if (pct >= 100) return { start, end, state: 'done', label: `Finished · plan was ${short(start)} → ${short(end)}` };
  if (today > end) return { start, end, state: 'over', label: `Plan ended ${short(end)} · ${100 - pct}% to go` };

  // Daily effort still needed to finish on time, from progress so far
  const from = today > start ? today : start;
  const remaining = estimateHours(course) * (1 - pct / 100);
  const pace = paceFor(remaining, from, end);
  const left = daysInclusive(today, end);
  if (today < start) {
    const inDays = daysInclusive(today, start) - 1;
    return {
      start, end, state: 'upcoming',
      label: `Starts ${formatKey(start)}${inDays === 1 ? ' · tomorrow' : ` · in ${inDays} days`} · ${pace.perDayLabel}`
    };
  }
  return {
    start, end, state: 'active',
    label: `Finish by ${formatKey(end)} · ${left} ${left === 1 ? 'day' : 'days'} left · ${pace.perDayLabel} to stay on track`
  };
};

const QUICK_LINKS = [
  { to: '/certificates', label: 'Certificates', note: 'Download & share', icon: 'bi-award' },
  { to: '/orders', label: 'Orders', note: 'Receipts & invoices', icon: 'bi-receipt' },
  { to: '/mentors', label: 'Mentors', note: 'Book a 1:1 session', icon: 'bi-people' },
  { to: '/events', label: 'Live events', note: 'Webinars & AMAs', icon: 'bi-broadcast' }
];

const greetingFor = (date) => {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const cached = readDashboardCache().data;
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState(cached?.courses || []);
  const [enrolledCourses, setEnrolledCourses] = useState(cached?.enrolledCourses || []);
  const [loading, setLoading] = useState(!cached);
  const [activeView, setActiveView] = useState('dashboard'); // dashboard, myGroups, explore
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  // Plan modal: { courseId, title, course, originalStart, value: { start, end }, saving, error }
  const [reschedule, setReschedule] = useState(null);

  useEffect(() => {
    // Get logged-in user
    const userData = localStorage.getItem('user');
    const parsedUser = userData ? JSON.parse(userData) : null;
    setUser(parsedUser);

    // A recent snapshot is already on screen — no need to hit the API again
    if (isDashboardCacheFresh()) return;
    loadDashboard(parsedUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboard = async (currentUser) => {
    if (!readDashboardCache().data) setLoading(true);
    try {
      const [profileRes, coursesRes] = await Promise.all([
        currentUser ? getProfile(currentUser.id).catch(() => null) : Promise.resolve(null),
        getAllCourses().catch(() => null)
      ]);
      const enrolled = profileRes?.data?.success ? profileRes.data.user.enrolledCourses || [] : [];
      const allCourses = coursesRes?.data?.data || [];
      setEnrolledCourses(enrolled);
      setCourses(allCourses);
      if (profileRes && coursesRes) {
        writeDashboardCache({ enrolledCourses: enrolled, courses: allCourses });
      }
    } finally {
      setLoading(false);
    }
  };

  const getThumbnailUrl = (thumbnail) => {
    if (!thumbnail) return FALLBACK_THUMB;
    if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
      return thumbnail;
    }
    return `${SERVER_URL}${thumbnail}`;
  };

  const onThumbError = (e) => {
    e.target.onerror = null;
    e.target.src = FALLBACK_THUMB;
  };

  const openReschedule = (row) => {
    const info = planInfo(row.enrollment, row.full, row.pct);
    setReschedule({
      courseId: row.course._id,
      title: row.course.title,
      course: row.full,
      originalStart: info?.start || '',
      value: { start: info?.start || '', end: info?.end || '' },
      saving: false,
      error: ''
    });
  };

  const saveReschedule = async () => {
    const { start, end } = reschedule?.value || {};
    if (!start || !end) return;
    setReschedule((r) => ({ ...r, saving: true, error: '' }));
    try {
      const res = await updateSchedule(reschedule.courseId, start, end);
      const { startDate, endDate } = res.data?.data || {};
      setEnrolledCourses((list) => list.map((e) =>
        e.courseId?._id === reschedule.courseId ? { ...e, startDate, endDate } : e
      ));
      setReschedule(null);
      toast.success('Study plan updated');
    } catch (err) {
      setReschedule((r) => ({
        ...r,
        saving: false,
        error: err.response?.data?.message || 'Could not update your plan.'
      }));
    }
  };

  const renderPlan = (r) => {
    const info = planInfo(r.enrollment, r.full, r.pct);
    return (
      <button className={`dash-cohort${info ? ` is-${info.state}` : ''}`} onClick={() => openReschedule(r)}>
        <i className={`bi ${info?.state === 'done' ? 'bi-calendar-check' : 'bi-calendar-range'}`} aria-hidden="true" />
        <span>{info ? info.label : 'No study plan yet'}</span>
        <span className="dash-cohort__action">{info ? 'Change plan' : 'Plan my pace'}</span>
      </button>
    );
  };

  const handleCourseClick = (courseId) => {
    navigate(`/lms/${courseId}`);
  };

  // ---------- Derived data (presentation only) ----------
  // The profile endpoint only populates title/description/instructor, so we
  // join against the full catalogue for thumbnails, modules and durations.
  const courseById = useMemo(() => {
    const map = {};
    courses.forEach((c) => { map[c._id] = c; });
    return map;
  }, [courses]);

  const rows = useMemo(() => enrolledCourses
    .filter((e) => e.courseId && e.courseId._id)
    .map((enrollment) => {
      const course = enrollment.courseId;
      const full = courseById[course._id] || {};
      const lessons = (full.modules || []).flatMap((m, mi) =>
        (m.lessons || []).map((l, li) => ({ ...l, moduleTitle: m.title, mi, li }))
      );
      const done = new Set(
        (enrollment.progress || []).filter((p) => p.completed).map((p) => String(p.lessonId))
      );
      const completedCount = (enrollment.progress || []).filter((p) => p.completed).length;
      const nextLesson = lessons.find((l) => !done.has(String(l._id)));
      const lastActivity = (enrollment.progress || [])
        .map((p) => p.completedAt)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        enrollment,
        course,
        full,
        pct: enrollment.completionPercentage || 0,
        totalLessons: lessons.length,
        completedCount,
        nextLesson,
        seconds: lessons.reduce((acc, l) => acc + parseDuration(l.duration), 0),
        lastTouched: lastActivity || enrollment.enrolledAt
      };
    }), [enrolledCourses, courseById]);

  const resumeRow = useMemo(() => {
    if (!rows.length) return null;
    const open = rows.filter((r) => r.pct < 100);
    const pool = open.length ? open : rows;
    return [...pool].sort((a, b) => new Date(b.lastTouched) - new Date(a.lastTouched))[0];
  }, [rows]);

  const stats = useMemo(() => {
    const lessonsDone = rows.reduce((a, r) => a + r.completedCount, 0);
    const lessonsTotal = rows.reduce((a, r) => a + r.totalLessons, 0);
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
    const finished = rows.filter((r) => r.pct === 100).length;
    const seconds = rows.reduce((a, r) => a + r.seconds, 0);
    return { lessonsDone, lessonsTotal, avg, finished, seconds };
  }, [rows]);

  const now = new Date();
  const dateStamp = `${DAYS[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]}`;
  const firstName = (user?.name || '').split(' ')[0];

  // ---------- Pieces ----------
  const renderEmpty = () => (
    <div className="dash-empty edu-pop">
      <p className="edu-label edu-label--accent">Nothing here yet</p>
      <h2 className="edu-h2">Your first program <em>starts</em> here.</h2>
      <p className="dash-empty__text">
        Pick a program from the catalogue. Once you enrol, your lessons and progress show up here.
      </p>
      <div className="dash-empty__actions">
        <button className="edu-btn edu-btn--accent edu-btn--lg" onClick={() => navigate('/courses')}>
          Browse programs <i className="bi bi-arrow-right" aria-hidden="true" />
        </button>
        <button className="edu-btn edu-btn--ghost edu-btn--lg" onClick={() => setActiveView('explore')}>
          Explore here
        </button>
      </div>
    </div>
  );

  const renderProgress = (pct, accent) => (
    <div
      className="edu-progress dash-bar"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`edu-progress__bar${accent ? ' edu-progress__bar--accent' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  const actionLabel = (pct) => (pct === 0 ? 'Start' : pct === 100 ? 'Review' : 'Continue');

  const statusTag = (pct) => (
    pct === 100
      ? <span className="edu-tag edu-tag--forest">Completed</span>
      : pct === 0
        ? <span className="edu-tag edu-tag--soft">Not started</span>
        : <span className="edu-tag edu-tag--ochre">In progress</span>
  );

  const renderCourseRows = (onRowOpen) => (
    <ol className="dash-rows">
      {rows.map((r, i) => (
        <li key={r.course._id} className={`dash-row${r.pct === 100 ? ' is-done' : ''}`}>
          <div className="dash-row__thumb">
            <img src={getThumbnailUrl(r.full.thumbnail)} alt="" onError={onThumbError} loading="lazy" />
            <span className="dash-row__num">{String(i + 1).padStart(2, '0')}</span>
          </div>
          <div className="dash-row__title">
            <div className="dash-row__tags">
              {statusTag(r.pct)}
              {r.full.category && <span className="edu-tag edu-tag--soft">{r.full.category}</span>}
            </div>
            <button className="dash-row__name" onClick={() => onRowOpen(r)}>
              {r.course.title}
            </button>
            <span className="dash-row__meta">
              {r.course.instructor && <span>{r.course.instructor}</span>}
              <span>Enrolled {shortDate(r.enrollment.enrolledAt)}</span>
            </span>
            {renderPlan(r)}
          </div>
          <div className="dash-row__progress">
            <div className="dash-row__pct">
              <strong>{r.pct}<small>%</small></strong>
              {r.totalLessons > 0 && (
                <span>{r.completedCount}/{r.totalLessons} lessons</span>
              )}
            </div>
            {renderProgress(r.pct, r.pct === 100)}
          </div>
          <button
            className={`edu-btn edu-btn--sm ${r.pct === 0 ? '' : r.pct === 100 ? 'edu-btn--ghost' : 'edu-btn--accent'} dash-row__go`}
            onClick={() => handleCourseClick(r.course._id)}
          >
            {actionLabel(r.pct)} <i className="bi bi-arrow-right" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );

  // Dashboard View
  const renderDashboard = () => (
    <div className="dash">
      <section className="dash-hello">
        <p className="edu-label dash-hello__date">{dateStamp}</p>
        <h2 className="edu-h1">
          {greetingFor(now)}{firstName ? <>,<br className="dash-hello__br" /> <em>{firstName}</em></> : null}.
        </h2>
        <p className="dash-hello__sub">
          {rows.length === 0
            ? 'Nothing on your list yet. Enrol in a program to get started.'
            : resumeRow && resumeRow.pct < 100
              ? `${rows.length} ${rows.length === 1 ? 'program' : 'programs'} on the go. Pick up where you stopped.`
              : 'Every enrolled program is complete. Time for the next one.'}
        </p>
      </section>

      {rows.length > 0 && resumeRow && (
        <section className="dash-section" aria-label="Continue learning">
          <article className="dash-resume edu-pop">
            <div className="dash-resume__body">
              <div className="dash-resume__kicker">
                <span className="edu-tag edu-tag--accent">{resumeRow.pct === 100 ? 'Completed' : 'Continue learning'}</span>
                <span className="edu-label">
                  {resumeRow.full.category || 'Program'}
                  {resumeRow.course.instructor ? ` · ${resumeRow.course.instructor}` : ''}
                </span>
              </div>
              <h3 className="edu-h2 dash-resume__title">{resumeRow.course.title}</h3>

              {resumeRow.nextLesson ? (
                <div className="dash-resume__next">
                  <span className="edu-label">Up next</span>
                  <p>
                    <span className="dash-resume__code">M{resumeRow.nextLesson.mi + 1}.{resumeRow.nextLesson.li + 1}</span>
                    <span className="dash-resume__lesson">{resumeRow.nextLesson.title}</span>
                    {resumeRow.nextLesson.duration && (
                      <span className="dash-resume__dur">{resumeRow.nextLesson.duration}</span>
                    )}
                  </p>
                </div>
              ) : resumeRow.pct === 100 ? (
                <div className="dash-resume__next">
                  <span className="edu-label">Status</span>
                  <p><span className="dash-resume__lesson">All lessons finished.</span></p>
                </div>
              ) : null}

              <div className="dash-resume__progress">
                <div className="dash-resume__pct">
                  <span className="dash-resume__big">{resumeRow.pct}<small>%</small></span>
                  <span className="edu-label">
                    {resumeRow.totalLessons > 0
                      ? `${resumeRow.completedCount} of ${resumeRow.totalLessons} lessons`
                      : 'complete'}
                  </span>
                </div>
                {renderProgress(resumeRow.pct, true)}
              </div>

              <button
                className="edu-btn edu-btn--accent edu-btn--lg dash-resume__go"
                onClick={() => handleCourseClick(resumeRow.course._id)}
              >
                {resumeRow.pct === 0 ? 'Start learning' : resumeRow.pct === 100 ? 'Review program' : 'Resume lesson'}
                <i className="bi bi-arrow-right" aria-hidden="true" />
              </button>
            </div>
            <div className="dash-resume__thumb">
              <img src={getThumbnailUrl(resumeRow.full.thumbnail)} alt="" onError={onThumbError} />
            </div>
          </article>
        </section>
      )}

      <section className="dash-stats" aria-label="Summary">
        <div className="dash-stat">
          <p className="edu-label">Enrolled</p>
          <p className="dash-stat__value">{rows.length}</p>
          <p className="dash-stat__note">{stats.finished} finished</p>
        </div>
        <div className="dash-stat">
          <p className="edu-label">Lessons done</p>
          <p className="dash-stat__value">{stats.lessonsDone}</p>
          <p className="dash-stat__note">
            {stats.lessonsTotal ? `of ${stats.lessonsTotal} in your programs` : 'none yet'}
          </p>
        </div>
        <div className="dash-stat">
          <p className="edu-label">Completion</p>
          <p className="dash-stat__value">{stats.avg}<small>%</small></p>
          <p className="dash-stat__note">average across programs</p>
        </div>
        <div className="dash-stat">
          <p className="edu-label">Video content</p>
          <p className="dash-stat__value">{formatHours(stats.seconds)}<small>h</small></p>
          <p className="dash-stat__note">total runtime enrolled</p>
        </div>
      </section>

      <nav className="dash-quick" aria-label="Quick links">
        {QUICK_LINKS.map((q) => (
          <Link key={q.to} to={q.to} className="dash-quick__link">
            <i className={`bi ${q.icon}`} aria-hidden="true" />
            <span className="dash-quick__text">
              <strong>{q.label}</strong>
              <span>{q.note}</span>
            </span>
            <i className="bi bi-arrow-up-right dash-quick__go" aria-hidden="true" />
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? renderEmpty() : (
        <section className="dash-section">
          <div className="dash-sechead">
            <h2 className="edu-h3">Your programs</h2>
            <span className="edu-label">{rows.length} total</span>
          </div>
          {renderCourseRows((r) => handleCourseClick(r.course._id))}
        </section>
      )}
    </div>
  );

  // My Groups View (Shows Enrolled Courses)
  const renderMyGroups = () => {
    if (!selectedGroup) {
      return (
        <div className="dash">
          <div className="dash-viewhead">
            <p className="edu-label edu-label--accent">Enrolled programs</p>
            <h2 className="edu-h1">My <em>programs</em></h2>
          </div>
          {rows.length > 0
            ? renderCourseRows((r) => setSelectedGroup(r.enrollment))
            : renderEmpty()}
        </div>
      );
    }

    const r = rows.find((x) => x.enrollment === selectedGroup)
      || rows.find((x) => x.course._id === selectedGroup.courseId?._id);
    const course = selectedGroup.courseId;
    const pct = selectedGroup.completionPercentage || 0;

    return (
      <div className="dash">
        <button className="dash-back" onClick={() => setSelectedGroup(null)}>
          <i className="bi bi-arrow-left" aria-hidden="true" /> All programs
        </button>

        <header className="dash-detail edu-pop">
          <div className="dash-detail__thumb">
            <img src={getThumbnailUrl(r?.full.thumbnail)} alt="" onError={onThumbError} />
          </div>
          <div className="dash-detail__text">
            <div className="dash-resume__kicker">
              {statusTag(pct)}
              <span className="edu-label">Enrolled {shortDate(selectedGroup.enrolledAt)}</span>
            </div>
            <h2 className="edu-h2">{course.title}</h2>
            {course.description && <p className="dash-detail__desc">{course.description}</p>}
            <div className="dash-detail__progress">
              <div className="dash-resume__pct">
                <span className="dash-resume__big">{pct}<small>%</small></span>
                {r && r.totalLessons > 0 && <span className="edu-label">{r.completedCount}/{r.totalLessons} lessons</span>}
              </div>
              {renderProgress(pct, true)}
            </div>
          </div>
        </header>

        <div className="dash-links">
          <button className="dash-link" onClick={() => handleCourseClick(course._id)}>
            <span className="dash-link__num">01</span>
            <span className="dash-link__body">
              <strong>Lessons</strong>
              <span>Open the classroom and {pct === 0 ? 'start' : 'continue'} watching.</span>
            </span>
            <span className="dash-link__go"><i className="bi bi-arrow-right" aria-hidden="true" /></span>
          </button>
          <div className="dash-link is-disabled" aria-disabled="true">
            <span className="dash-link__num">02</span>
            <span className="dash-link__body">
              <strong>Discussion</strong>
              <span>Not available yet.</span>
            </span>
            <span className="edu-tag edu-tag--soft">Soon</span>
          </div>
        </div>
      </div>
    );
  };

  // Explore View
  const renderExplore = () => {
    const filteredCourses = courses.filter((course) =>
      selectedCategory === 'all' || course.category?.toLowerCase() === selectedCategory
    );
    const enrolledIds = new Set(rows.map((r) => r.course._id));

    return (
      <div className="dash">
        <div className="dash-viewhead">
          <p className="edu-label edu-label--accent">Catalogue</p>
          <h2 className="edu-h1">Find your <em>next</em> program</h2>
        </div>

        <div className="dash-filter" role="tablist" aria-label="Category">
          {[{ key: 'all', label: 'All' }, ...CATEGORIES].map((cat) => (
            <button
              key={cat.key}
              role="tab"
              aria-selected={selectedCategory === cat.key}
              className={`dash-filter__btn${selectedCategory === cat.key ? ' is-active' : ''}`}
              onClick={() => setSelectedCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {filteredCourses.length === 0 ? (
          <div className="edu-empty">
            <h3 className="edu-h3">No programs in this category yet.</h3>
            <p className="edu-muted">Try another category or browse the full catalogue.</p>
          </div>
        ) : (
          <div className="dash-grid">
            {filteredCourses.map((course) => {
              const lessonCount = (course.modules || []).reduce(
                (a, m) => a + (m.lessons || []).length, 0
              );
              const enrolled = enrolledIds.has(course._id);
              return (
                <article key={course._id} className="dash-card">
                  <div className="dash-card__thumb">
                    <img src={getThumbnailUrl(course.thumbnail)} alt="" onError={onThumbError} loading="lazy" />
                    {enrolled && <span className="edu-tag edu-tag--accent dash-card__flag">Enrolled</span>}
                  </div>
                  <div className="dash-card__body">
                    {course.category && <p className="edu-label">{course.category}</p>}
                    <h3 className="dash-card__title">{course.title}</h3>
                    <dl className="dash-card__meta">
                      {course.duration && (<div><dt>Length</dt><dd>{course.duration}</dd></div>)}
                      <div><dt>Lessons</dt><dd>{lessonCount}</dd></div>
                      {course.instructor && (<div className="dash-card__mentor"><dt>Mentor</dt><dd>{course.instructor}</dd></div>)}
                    </dl>
                  </div>
                  <div className="dash-card__actions">
                    <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => navigate('/courses')}>
                      Details
                    </button>
                    <button
                      className={`edu-btn edu-btn--sm${enrolled ? ' edu-btn--accent' : ''}`}
                      onClick={() => handleCourseClick(course._id)}
                    >
                      {enrolled ? 'Open' : 'Start learning'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const nav = [
    { key: 'dashboard', label: 'Home', active: activeView === 'dashboard', onClick: () => setActiveView('dashboard') },
    {
      key: 'myGroups',
      label: 'My programs',
      active: activeView === 'myGroups',
      onClick: () => { setActiveView('myGroups'); setSelectedGroup(null); }
    },
    { key: 'explore', label: 'Explore', active: activeView === 'explore', onClick: () => setActiveView('explore') },
    ...LEARNER_LINKS.filter((l) => l.key !== 'dashboard'),
    ...(user?.role === 'admin' ? [{ key: 'admin', label: 'Admin console', to: '/admin-upload' }] : [])
  ];

  const titles = {
    dashboard: 'Home',
    myGroups: 'My programs',
    explore: 'Explore'
  };

  return (
    <AppShell
      nav={nav}
      eyebrow="Learner"
      title={titles[activeView]}
      actions={
        <button className="edu-btn edu-btn--ghost edu-btn--sm dash-top-btn" onClick={() => navigate('/courses')}>
          Browse programs
        </button>
      }
    >
      {loading ? (
        <div className="edu-loading">
          <div className="edu-spinner" />
          <p className="edu-label">Loading your programs</p>
        </div>
      ) : (
        <>
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'myGroups' && renderMyGroups()}
          {activeView === 'explore' && renderExplore()}
        </>
      )}

      {reschedule && (
        <div className="edu-modal-overlay" onClick={() => !reschedule.saving && setReschedule(null)}>
          <div
            className="edu-modal dash-resched"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resched-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="edu-modal__head">
              <div>
                <p className="edu-label">Your study plan</p>
                <h2 id="resched-title" className="edu-h3">{reschedule.title}</h2>
              </div>
              <button className="edu-close" onClick={() => setReschedule(null)} aria-label="Close">×</button>
            </div>
            <div className="edu-modal__body">
              <p className="dash-resched__hint">
                Pick any start and end date. Your progress stays exactly as it is.
              </p>
              <SchedulePlanner
                course={reschedule.course}
                value={reschedule.value}
                onChange={(value) => setReschedule((r) => ({ ...r, value }))}
                minStart={reschedule.originalStart}
              />
              {reschedule.error && (
                <div className="edu-alert edu-alert--error dash-resched__error" role="alert">{reschedule.error}</div>
              )}
            </div>
            <div className="edu-modal__foot">
              <button className="edu-btn edu-btn--ghost" onClick={() => setReschedule(null)} disabled={reschedule.saving}>
                Cancel
              </button>
              <button
                className="edu-btn edu-btn--accent"
                onClick={saveReschedule}
                disabled={!reschedule.value.start || !reschedule.value.end || reschedule.saving}
              >
                {reschedule.saving ? 'Saving…' : 'Save plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default StudentDashboard;
