import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import WishlistButton from '../components/WishlistButton';
import { CATEGORIES } from '../brand';
import {
  searchCourses,
  thumbUrl,
  FALLBACK_THUMB,
  formatPrice,
  formatRating,
  isSignedIn
} from '../services/catalogApi';
import './CoursesPage.css';

const pad = (n) => String(n).padStart(2, '0');

const SORT_OPTIONS = [
  { value: '', label: 'Featured' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' }
];

const SEARCH_DELAY_MS = 350;

const CoursesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedInterest = location.state?.interest || 'all';

  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(selectedInterest);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const requestId = useRef(0);

  // Full catalogue for the board count and category tallies
  useEffect(() => {
    let alive = true;
    searchCourses()
      .then((res) => { if (alive) setCatalog(res.data.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setCatalogLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (selectedInterest !== 'all') setFilter(selectedInterest);
  }, [selectedInterest]);

  // Debounce typing before asking the server
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    searchCourses({ search, category: filter, sort })
      .then((res) => {
        if (id === requestId.current) setResults(res.data.data || []);
      })
      .catch(() => {
        if (id === requestId.current) setResults([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [search, filter, sort]);

  const openCourse = (courseId) => navigate(`/courses/${courseId}`);

  const handleEnroll = (e, courseId) => {
    e.stopPropagation();
    if (!isSignedIn()) {
      navigate('/auth', { state: { from: `/payment/${courseId}` } });
    } else {
      navigate(`/payment/${courseId}`);
    }
  };

  const resetAll = () => {
    setFilter('all');
    setQuery('');
    setSearch('');
    setSort('');
  };

  const tabs = [{ key: 'all', label: 'All' }, ...CATEGORIES];
  const activeLabel = tabs.find((t) => t.key === filter)?.label || 'All';
  const countFor = (key) => (key === 'all' ? catalog.length : catalog.filter((c) => c.category === key).length);
  const hasFilters = filter !== 'all' || query !== '' || sort !== '';
  const firstLoad = loading && results.length === 0;

  return (
    <div className="courses-page">
      <SiteHeader />

      <header className="courses-head">
        <div className="edu-container">
          <div className="courses-head__meta">
            <p className="edu-label edu-label--accent">Programs</p>
            <p className="edu-label">
              {catalogLoading ? '—' : `${pad(catalog.length)} on the board`}
            </p>
          </div>

          <h1 className="edu-display courses-head__title">
            Pick one.<br /><em>Finish it.</em>
          </h1>

          <div className="courses-head__row">
            <p className="edu-lead">
              Every program has a mentor, a weekly deadline and a final project
              someone actually reads. The price you see is the whole price.
            </p>
            <label className="courses-search" htmlFor="courses-search">
              <span className="edu-label">Search programs</span>
              <input
                id="courses-search"
                type="search"
                className="courses-search__input"
                placeholder="Python, valuation, Tableau"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>
      </header>

      <nav className="courses-tabs" aria-label="Filter by category">
        <div className="edu-container">
          <div className="courses-tabs__row" role="tablist">
            {tabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  className={`courses-tab${active ? ' is-active' : ''}`}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label}
                  <span className="courses-tab__count">{catalogLoading ? '··' : pad(countFor(tab.key))}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="courses-list-wrap">
        <div className="edu-container">
          <div className="courses-list__meta">
            <span className="edu-label edu-label--ink" aria-live="polite">
              {activeLabel} <span className="courses-list__sep">/</span>{' '}
              {firstLoad ? '··' : `${pad(results.length)} ${results.length === 1 ? 'result' : 'results'}`}
              {search && !firstLoad && (
                <span className="courses-list__query"> for “{search}”</span>
              )}
            </span>
            <div className="courses-list__tools">
              {hasFilters && (
                <button className="edu-link courses-reset" onClick={resetAll}>
                  Clear filters
                </button>
              )}
              <label className="courses-sort">
                <span className="edu-label">Sort</span>
                <select
                  className="edu-select courses-sort__select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value || 'featured'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {firstLoad ? (
            <div className="edu-loading courses-loading">
              <div className="edu-spinner" role="status" aria-label="Loading courses" />
              <p className="edu-label">Loading programs</p>
            </div>
          ) : results.length === 0 ? (
            <div className="edu-empty courses-empty">
              <h3 className="edu-h2">Nothing <em>matches.</em></h3>
              <p className="edu-muted">Try another category, or a shorter search.</p>
              <button className="edu-btn" onClick={resetAll}>
                Show everything
              </button>
            </div>
          ) : (
            <ol className={`courses-grid${loading ? ' is-refreshing' : ''}`}>
              {results.map((course, i) => (
                <li
                  key={course._id}
                  className="edu-pop course-card"
                  role="link"
                  tabIndex={0}
                  aria-label={`${course.title} — view program`}
                  onClick={() => openCourse(course._id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) openCourse(course._id);
                  }}
                >
                  <div className="course-card__media">
                    <img
                      src={thumbUrl(course.thumbnail)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = FALLBACK_THUMB;
                      }}
                    />
                    <span className="course-card__num">{pad(i + 1)}</span>
                    <WishlistButton
                      courseId={course._id}
                      courseTitle={course.title}
                      className="course-card__wish"
                    />
                    {course.category && (
                      <span className="edu-tag edu-tag--solid course-card__cat">{course.category}</span>
                    )}
                  </div>

                  <div className="course-card__body">
                    <h2 className="course-card__title">{course.title}</h2>
                    {course.instructor && (
                      <p className="course-card__by">
                        with {course.instructor}
                        {course.level && <span className="course-card__level"> · {course.level}</span>}
                      </p>
                    )}
                    <p className="course-card__desc">{course.description}</p>

                    <dl className="course-card__facts">
                      <div>
                        <dt>Length</dt>
                        <dd>{course.duration || 'Self-paced'}</dd>
                      </div>
                      <div>
                        <dt>Modules</dt>
                        <dd>{pad(course.modules?.length || 0)}</dd>
                      </div>
                      <div>
                        <dt>Rating</dt>
                        <dd>
                          {course.ratingCount ? (
                            <>
                              <span className="course-card__star" aria-hidden="true">★</span>
                              {formatRating(course.ratingAvg)}
                              <span className="course-card__rc"> ({course.ratingCount})</span>
                            </>
                          ) : (
                            <span className="course-card__rc">New</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="course-card__foot">
                      <div className="course-card__price">
                        <span className="edu-label">One-time fee</span>
                        <strong>{formatPrice(course.price || 500)}</strong>
                      </div>
                      <button
                        className="edu-btn edu-btn--accent course-card__cta"
                        onClick={(e) => handleEnroll(e, course._id)}
                        aria-label={`Enroll in ${course.title}`}
                      >
                        Enroll <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>

      <section className="courses-note">
        <div className="edu-container courses-note__grid">
          <p className="edu-label edu-label--accent">Not sure?</p>
          <p className="courses-note__text">
            Start with the shortest program in a field you already like.
            <em> Most people come back for a second.</em>
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default CoursesPage;
