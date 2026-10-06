import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import WishlistButton from '../components/WishlistButton';
import { toast } from '../components/Toaster';
import {
  getCourse,
  getCourseReviews,
  getMyReview,
  getRelatedCourses,
  saveReview,
  deleteReview,
  isSignedIn,
  getStoredUser,
  thumbUrl,
  FALLBACK_THUMB,
  formatPrice,
  formatRating,
  totalRuntime
} from '../services/catalogApi';
import './CourseDetailPage.css';

const pad = (n) => String(n).padStart(2, '0');
const MIN_TEXT = 10;
const MAX_TEXT = 1000;
const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const initialsOf = (name = '') =>
  name
    .replace(/^(Dr\.|CA|CFA|FRM|MBA)\s+/i, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const Stars = ({ value = 0, size = 'md', label }) => {
  const pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100));
  return (
    <span className={`cd-stars cd-stars--${size}`} role="img" aria-label={label || `${formatRating(value)} out of 5 stars`}>
      <span className="cd-stars__base" aria-hidden="true">★★★★★</span>
      <span className="cd-stars__fill" style={{ width: `${pct}%` }} aria-hidden="true">★★★★★</span>
    </span>
  );
};

// ---------------------------------------------------------------------------

const ReviewForm = ({ courseId, existing, onSaved, onCancel }) => {
  const [rating, setRating] = useState(existing?.rating || 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(existing?.text || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = text.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Pick a star rating first.');
    if (trimmed.length < MIN_TEXT) return setError(`Write at least ${MIN_TEXT} characters so others know what you thought.`);
    if (trimmed.length > MAX_TEXT) return setError(`Please keep it under ${MAX_TEXT} characters.`);
    setError('');
    setSaving(true);
    try {
      const res = await saveReview(courseId, { rating, text: trimmed });
      toast.success(res.data?.message || 'Review saved');
      onSaved();
    } catch {
      // the API layer already surfaced the error
    } finally {
      setSaving(false);
    }
  };

  const shown = hover || rating;

  return (
    <form className="cd-review-form edu-panel" onSubmit={submit} noValidate>
      <div className="cd-review-form__head">
        <p className="edu-label edu-label--accent">{existing ? 'Edit your review' : 'Write a review'}</p>
      </div>

      <fieldset className="cd-rate">
        <legend className="edu-label">Your rating</legend>
        <div className="cd-rate__row" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`cd-rate__star${n <= shown ? ' is-on' : ''}`}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => { setRating(n); setError(''); }}
            >
              ★
            </button>
          ))}
          <span className="cd-rate__word">{RATING_WORDS[shown] || 'Tap to rate'}</span>
        </div>
      </fieldset>

      <div className="edu-field">
        <label htmlFor="cd-review-text">Your review</label>
        <textarea
          id="cd-review-text"
          className="edu-textarea"
          rows={5}
          maxLength={MAX_TEXT}
          placeholder="What did you learn? Who would you recommend it to?"
          value={text}
          onChange={(e) => { setText(e.target.value); if (error) setError(''); }}
        />
        <span className={`cd-review-form__count${trimmed.length > 0 && trimmed.length < MIN_TEXT ? ' is-short' : ''}`}>
          {trimmed.length} / {MAX_TEXT}
        </span>
      </div>

      {error && <div className="edu-alert edu-alert--error" role="alert">{error}</div>}

      <div className="cd-review-form__actions">
        <button type="submit" className="edu-btn edu-btn--accent" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Update review' : 'Post review'}
        </button>
        {onCancel && (
          <button type="button" className="edu-btn edu-btn--ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------

const CourseDetailPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const signedIn = isSignedIn();
  const me = getStoredUser();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reviews, setReviews] = useState({ average: 0, count: 0, breakdown: {}, reviews: [] });
  const [mine, setMine] = useState({ enrolled: false, review: null });
  const [related, setRelated] = useState([]);
  const [openModules, setOpenModules] = useState({});
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const heroCtaRef = useRef(null);

  const loadReviews = useCallback(async () => {
    try {
      const res = await getCourseReviews(courseId);
      setReviews(res.data.data);
    } catch {
      /* toast shown by api layer */
    }
    if (isSignedIn()) {
      try {
        const res = await getMyReview(courseId);
        setMine(res.data.data);
      } catch {
        /* toast shown by api layer */
      }
    }
  }, [courseId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setEditing(false);
    setConfirmDelete(false);
    window.scrollTo(0, 0);

    getCourse(courseId, { silent: true })
      .then((res) => {
        if (!alive) return;
        const c = res.data.data;
        setCourse(c);
        setOpenModules(c.modules?.length ? { [c.modules[0]._id]: true } : {});
        getRelatedCourses(c.category)
          .then((r) => {
            if (alive) setRelated((r.data.data || []).filter((x) => x._id !== c._id).slice(0, 3));
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (!alive) return;
        if (err.response?.status === 404) setNotFound(true);
        else toast.error(err.response?.data?.message || 'Could not load this program. Please try again.');
      })
      .finally(() => { if (alive) setLoading(false); });

    loadReviews();
    return () => { alive = false; };
  }, [courseId, loadReviews]);

  // Show the sticky enrol bar once the hero call-to-action scrolls away
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [course, loading]);

  const lessons = useMemo(() => (course?.modules || []).flatMap((m) => m.lessons || []), [course]);

  const handleEnroll = () => {
    if (mine.enrolled) return navigate(`/lms/${courseId}`);
    if (!signedIn) return navigate('/auth', { state: { from: `/payment/${courseId}` } });
    navigate(`/payment/${courseId}`);
  };

  const toggleModule = (id) => setOpenModules((s) => ({ ...s, [id]: !s[id] }));
  const allOpen = course?.modules?.length > 0 && course.modules.every((m) => openModules[m._id]);
  const setAll = (open) =>
    setOpenModules(Object.fromEntries((course?.modules || []).map((m) => [m._id, open])));

  const afterReviewSaved = async () => {
    setEditing(false);
    await loadReviews();
  };

  const removeMyReview = async () => {
    if (!mine.review) return;
    try {
      const res = await deleteReview(mine.review._id);
      toast.success(res.data?.message || 'Review deleted');
      setConfirmDelete(false);
      setMine((m) => ({ ...m, review: null }));
      await loadReviews();
    } catch {
      /* toast shown by api layer */
    }
  };

  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="cd-page">
        <SiteHeader />
        <div className="edu-loading cd-loading">
          <div className="edu-spinner" role="status" aria-label="Loading program" />
          <p className="edu-label">Loading program</p>
        </div>
      </div>
    );
  }

  if (notFound || !course) {
    return (
      <div className="cd-page">
        <SiteHeader />
        <main className="edu-container cd-missing">
          <div className="edu-empty">
            <h1 className="edu-h2">Program <em>not found.</em></h1>
            <p className="edu-muted">It may have been retired or the link is incomplete.</p>
            <Link to="/courses" className="edu-btn">Browse programs</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const ctaLabel = mine.enrolled ? 'Go to classroom' : 'Enroll';
  const others = reviews.reviews.filter((r) => !mine.review || r._id !== mine.review._id);
  const maxBreakdown = Math.max(1, ...Object.values(reviews.breakdown || {}));

  return (
    <div className={`cd-page${showBar ? ' has-bar' : ''}`}>
      <SiteHeader />

      {/* ---------- Hero ---------- */}
      <header className="cd-hero">
        <div className="edu-container">
          <nav className="cd-crumbs" aria-label="Breadcrumb">
            <Link to="/courses">Programs</Link>
            <span aria-hidden="true">/</span>
            <Link to="/courses" state={{ interest: course.category }}>{course.category}</Link>
          </nav>

          <div className="cd-hero__grid">
            <div className="cd-hero__copy">
              <div className="cd-hero__tags">
                <span className="edu-tag edu-tag--solid">{course.category}</span>
                {course.level && <span className="edu-tag">{course.level}</span>}
                <span className="edu-tag edu-tag--soft">{course.language || 'English'}</span>
              </div>

              <h1 className="edu-h1 cd-hero__title">{course.title}</h1>
              <p className="edu-lead cd-hero__lead">{course.description}</p>

              <a href="#reviews" className="cd-hero__rating">
                {reviews.count > 0 ? (
                  <>
                    <Stars value={reviews.average} />
                    <strong>{formatRating(reviews.average)}</strong>
                    <span>({reviews.count} {reviews.count === 1 ? 'review' : 'reviews'})</span>
                  </>
                ) : (
                  <span>No reviews yet</span>
                )}
              </a>

              <dl className="cd-facts">
                <div><dt>Mentor</dt><dd>{course.instructor || 'Edu Learning'}</dd></div>
                <div><dt>Duration</dt><dd>{course.duration || 'Self-paced'}</dd></div>
                <div><dt>Lessons</dt><dd>{pad(lessons.length)} · {totalRuntime(lessons)}</dd></div>
                <div><dt>Level</dt><dd>{course.level || 'All levels'}</dd></div>
              </dl>
            </div>

            <aside className="cd-buy edu-pop">
              <div className="cd-buy__media">
                <img
                  src={thumbUrl(course.thumbnail)}
                  alt=""
                  onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_THUMB; }}
                />
              </div>
              <div className="cd-buy__body">
                {mine.enrolled ? (
                  <p className="edu-label edu-label--accent cd-buy__enrolled">You're enrolled</p>
                ) : (
                  <div className="cd-buy__price">
                    <span className="edu-label">One-time fee</span>
                    <strong>{formatPrice(course.price)}</strong>
                  </div>
                )}
                <div className="cd-buy__actions" ref={heroCtaRef}>
                  <button className="edu-btn edu-btn--accent edu-btn--lg cd-buy__cta" onClick={handleEnroll}>
                    {ctaLabel} <span aria-hidden="true">→</span>
                  </button>
                  <WishlistButton courseId={course._id} courseTitle={course.title} variant="hero" />
                </div>
                <ul className="cd-buy__list">
                  <li>{pad(course.modules?.length || 0)} modules, {pad(lessons.length)} video lessons</li>
                  <li>Mentor feedback on every assignment</li>
                  <li>Certificate on completion</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </header>

      <main className="cd-main">
        <div className="edu-container cd-main__grid">
          {/* ---------- Highlights & skills ---------- */}
          {course.highlights?.length > 0 && (
            <section className="cd-section" aria-labelledby="cd-highlights">
              <p className="edu-label edu-label--accent">Why this program</p>
              <h2 id="cd-highlights" className="edu-h2">What you <em>get.</em></h2>
              <ul className="cd-highlights">
                {course.highlights.map((h, i) => (
                  <li key={h}>
                    <span className="cd-highlights__num">{pad(i + 1)}</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {course.skills?.length > 0 && (
            <section className="cd-section" aria-labelledby="cd-skills">
              <p className="edu-label edu-label--accent">Skills</p>
              <h2 id="cd-skills" className="edu-h3">You'll leave able to use</h2>
              <ul className="cd-skills">
                {course.skills.map((s) => <li key={s} className="edu-tag">{s}</li>)}
              </ul>
            </section>
          )}

          {/* ---------- Syllabus ---------- */}
          <section className="cd-section" aria-labelledby="cd-syllabus">
            <div className="cd-section__head">
              <div>
                <p className="edu-label edu-label--accent">Syllabus</p>
                <h2 id="cd-syllabus" className="edu-h2">Week by <em>week.</em></h2>
                <p className="edu-muted cd-section__sub">
                  {pad(course.modules?.length || 0)} modules · {pad(lessons.length)} lessons · {totalRuntime(lessons)} of video
                </p>
              </div>
              {course.modules?.length > 1 && (
                <button className="edu-link cd-expand" onClick={() => setAll(!allOpen)}>
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>

            <ol className="cd-modules">
              {(course.modules || []).map((m, i) => {
                const open = Boolean(openModules[m._id]);
                return (
                  <li key={m._id} className={`cd-module${open ? ' is-open' : ''}`}>
                    <button
                      className="cd-module__head"
                      onClick={() => toggleModule(m._id)}
                      aria-expanded={open}
                      aria-controls={`cd-mod-${m._id}`}
                    >
                      <span className="cd-module__num">{pad(i + 1)}</span>
                      <span className="cd-module__titles">
                        <span className="cd-module__title">{m.title}</span>
                        <span className="cd-module__meta">
                          {m.lessons?.length || 0} {m.lessons?.length === 1 ? 'lesson' : 'lessons'} · {totalRuntime(m.lessons)}
                        </span>
                      </span>
                      <span className="cd-module__chev" aria-hidden="true">{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div id={`cd-mod-${m._id}`} className="cd-module__body">
                        {m.description && <p className="cd-module__desc">{m.description}</p>}
                        <ol className="cd-lessons">
                          {(m.lessons || []).map((l, j) => (
                            <li key={l._id} className="cd-lesson">
                              <span className="cd-lesson__num">{i + 1}.{j + 1}</span>
                              <span className="cd-lesson__title">{l.title}</span>
                              <span className="cd-lesson__dur">{l.duration || '—'}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ---------- Mentor ---------- */}
          <section className="cd-section" aria-labelledby="cd-mentor">
            <p className="edu-label edu-label--accent">Your mentor</p>
            <div className="cd-mentor edu-panel">
              <span className="cd-mentor__avatar" aria-hidden="true">{initialsOf(course.instructor || 'Edu Learning')}</span>
              <div className="cd-mentor__body">
                <h2 id="cd-mentor" className="edu-h3">{course.instructor || 'Edu Learning'}</h2>
                <p className="edu-muted">
                  Leads the {course.category} track at Edu Learning. Reviews every assignment in this
                  program personally and runs the weekly live clinic.
                </p>
                <Link to="/mentors" className="edu-link">Meet all mentors →</Link>
              </div>
            </div>
          </section>

          {/* ---------- Reviews ---------- */}
          <section className="cd-section" id="reviews" aria-labelledby="cd-reviews">
            <p className="edu-label edu-label--accent">Reviews</p>
            <h2 id="cd-reviews" className="edu-h2">From the <em>cohort.</em></h2>

            <div className="cd-rsum">
              <div className="cd-rsum__score">
                <strong>{reviews.count ? formatRating(reviews.average) : '—'}</strong>
                <Stars value={reviews.average} size="lg" />
                <span className="edu-label">{reviews.count} {reviews.count === 1 ? 'review' : 'reviews'}</span>
              </div>
              <ul className="cd-rsum__bars" aria-label="Rating breakdown">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = reviews.breakdown?.[n] || 0;
                  return (
                    <li key={n}>
                      <span className="cd-rsum__n">{n}★</span>
                      <span className="cd-rsum__track"><span style={{ width: `${(c / maxBreakdown) * 100}%` }} /></span>
                      <span className="cd-rsum__c">{c}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Your review / form */}
            {!signedIn ? (
              <div className="edu-alert edu-alert--info cd-review-gate">
                <span>Took this program? <Link to="/auth" state={{ from: `/courses/${courseId}` }} className="edu-link">Log in</Link> to leave a review.</span>
              </div>
            ) : mine.review && !editing ? (
              <article className="cd-review cd-review--mine edu-panel">
                <div className="cd-review__head">
                  <span className="cd-review__avatar" aria-hidden="true">{initialsOf(mine.review.userName)}</span>
                  <div className="cd-review__who">
                    <strong>Your review</strong>
                    <span>{formatDate(mine.review.updatedAt || mine.review.createdAt)}</span>
                  </div>
                  <Stars value={mine.review.rating} size="sm" />
                </div>
                <p className="cd-review__text">{mine.review.text}</p>
                <div className="cd-review__actions">
                  {confirmDelete ? (
                    <>
                      <span className="edu-muted">Delete your review?</span>
                      <button className="edu-btn edu-btn--danger edu-btn--sm" onClick={removeMyReview}>Yes, delete</button>
                      <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
                    </>
                  ) : (
                    <>
                      <button className="edu-btn edu-btn--sm" onClick={() => setEditing(true)}>Edit</button>
                      <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => setConfirmDelete(true)}>Delete</button>
                    </>
                  )}
                </div>
              </article>
            ) : mine.enrolled ? (
              <ReviewForm
                key={mine.review?._id || 'new'}
                courseId={courseId}
                existing={editing ? mine.review : null}
                onSaved={afterReviewSaved}
                onCancel={editing ? () => setEditing(false) : null}
              />
            ) : (
              <div className="edu-alert edu-alert--info cd-review-gate">
                <span>Reviews come from enrolled learners only{me?.name ? `, ${me.name.split(' ')[0]}` : ''}. Enroll to share yours once you've started.</span>
              </div>
            )}

            {others.length > 0 ? (
              <ol className="cd-reviews">
                {others.map((r) => (
                  <li key={r._id} className="cd-review">
                    <div className="cd-review__head">
                      <span className="cd-review__avatar" aria-hidden="true">{initialsOf(r.userName)}</span>
                      <div className="cd-review__who">
                        <strong>{r.userName}</strong>
                        <span>{formatDate(r.createdAt)}</span>
                      </div>
                      <Stars value={r.rating} size="sm" />
                    </div>
                    <p className="cd-review__text">{r.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              !mine.review && (
                <div className="edu-empty cd-reviews-empty">
                  <h3 className="edu-h3">No reviews <em>yet.</em></h3>
                  <p className="edu-muted">Be the first from your cohort to share how it went.</p>
                </div>
              )
            )}
          </section>
        </div>
      </main>

      {/* ---------- Related ---------- */}
      {related.length > 0 && (
        <section className="cd-related">
          <div className="edu-container">
            <p className="edu-label edu-label--accent">More in {course.category}</p>
            <h2 className="edu-h2">Pairs well <em>with.</em></h2>
            <ul className="cd-related__grid">
              {related.map((r) => (
                <li key={r._id} className="edu-pop cd-rel">
                  <Link to={`/courses/${r._id}`} className="cd-rel__link">
                    <div className="cd-rel__media">
                      <img
                        src={thumbUrl(r.thumbnail)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_THUMB; }}
                      />
                    </div>
                    <div className="cd-rel__body">
                      <h3 className="cd-rel__title">{r.title}</h3>
                      <p className="cd-rel__meta">
                        {r.ratingCount ? <><span className="cd-rel__star">★</span>{formatRating(r.ratingAvg)} · </> : null}
                        {r.duration}
                      </p>
                      <strong className="cd-rel__price">{formatPrice(r.price)}</strong>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- Sticky enrol bar ---------- */}
      <div className={`cd-bar${showBar ? ' is-visible' : ''}`} aria-hidden={!showBar}>
        <div className="edu-container cd-bar__inner">
          <div className="cd-bar__info">
            <strong className="cd-bar__title">{course.title}</strong>
            <span className="cd-bar__price">{mine.enrolled ? "You're enrolled" : formatPrice(course.price)}</span>
          </div>
          <button className="edu-btn edu-btn--accent cd-bar__cta" onClick={handleEnroll} tabIndex={showBar ? 0 : -1}>
            {ctaLabel} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
};

export default CourseDetailPage;
