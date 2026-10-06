import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { CATEGORIES } from '../brand';
import { getMentors, formatDateKey, formatSlot } from '../services/communityApi';
import './MentorsPage.css';

const SORTS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'experience', label: 'Most experienced' }
];

const pad = (n) => String(n).padStart(2, '0');

export const MentorPrice = ({ price, className = '' }) => (
  <span className={`mentor-price ${className}`}>
    {price > 0 ? (
      <>
        <strong>₹{Number(price).toLocaleString('en-IN')}</strong>
        <span> / 30 min</span>
      </>
    ) : (
      <strong className="mentor-price__free">Free intro</strong>
    )}
  </span>
);

export const Rating = ({ value, count }) => (
  <span className="mentor-rating" aria-label={`Rated ${value} out of 5 from ${count} reviews`}>
    <span className="mentor-rating__star" aria-hidden="true">★</span>
    <strong>{Number(value).toFixed(1)}</strong>
    {count != null && <span className="mentor-rating__count">({count})</span>}
  </span>
);

const MentorsPage = () => {
  const navigate = useNavigate();
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expertise, setExpertise] = useState('all');
  const [sort, setSort] = useState('recommended');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setFailed(false);
    const params = { sort };
    if (expertise !== 'all') params.expertise = expertise;
    if (debouncedQuery) params.q = debouncedQuery;
    getMentors(params)
      .then((res) => {
        if (id === requestId.current) setMentors(res.data.data || []);
      })
      .catch(() => {
        if (id === requestId.current) setFailed(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [expertise, sort, debouncedQuery, reloadKey]);

  const chips = [{ key: 'all', label: 'All mentors' }, ...CATEGORIES];
  const hasFilters = expertise !== 'all' || query.trim();
  const clearFilters = () => { setExpertise('all'); setQuery(''); };

  return (
    <div className="mentors-page">
      <SiteHeader />

      <header className="mentors-head">
        <div className="edu-container">
          <div className="mentors-head__meta">
            <p className="edu-label edu-label--accent">Mentors</p>
            <p className="edu-label">1:1 · 30 minutes · Online</p>
          </div>
          <h1 className="edu-display mentors-head__title">
            Ask someone<br /><em>who’s done it.</em>
          </h1>
          <div className="mentors-head__row">
            <p className="edu-lead">
              Book a 30-minute video call with people who hire, manage and do the work
              every day. Start with a free intro, or go deep on a model, a portfolio or a mock interview.
            </p>
            <label className="mentors-search" htmlFor="mentors-search">
              <span className="edu-label">Search mentors</span>
              <input
                id="mentors-search"
                type="search"
                className="mentors-search__input"
                placeholder="Valuation, SQL, product"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
        </div>
      </header>

      <nav className="mentors-filters" aria-label="Filter mentors">
        <div className="edu-container mentors-filters__inner">
          <div className="mentors-chips" role="tablist">
            {chips.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={expertise === c.key}
                className={`mentors-chip${expertise === c.key ? ' is-active' : ''}`}
                onClick={() => setExpertise(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label className="mentors-sort">
            <span className="edu-label">Sort</span>
            <select className="edu-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </nav>

      <main className="mentors-main">
        <div className="edu-container">
          <div className="mentors-meta">
            <span className="edu-label edu-label--ink">
              {loading ? 'Loading' : `${pad(mentors.length)} ${mentors.length === 1 ? 'mentor' : 'mentors'}`}
            </span>
            {hasFilters && (
              <button className="edu-link mentors-reset" onClick={clearFilters}>Clear filters</button>
            )}
          </div>

          {loading && mentors.length === 0 ? (
            <div className="edu-loading mentors-loading">
              <div className="edu-spinner" role="status" aria-label="Loading mentors" />
            </div>
          ) : failed ? (
            <div className="edu-empty mentors-empty">
              <h2 className="edu-h2">Couldn’t load <em>mentors.</em></h2>
              <p className="edu-muted">Check your connection and try again.</p>
              <button className="edu-btn" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </div>
          ) : mentors.length === 0 ? (
            <div className="edu-empty mentors-empty">
              <h2 className="edu-h2">No one <em>matches.</em></h2>
              <p className="edu-muted">Try another area of expertise, or a shorter search.</p>
              <button className="edu-btn" onClick={clearFilters}>Show all mentors</button>
            </div>
          ) : (
            <ul className={`mentors-grid${loading ? ' is-refreshing' : ''}`}>
              {mentors.map((m) => (
                <li key={m._id} className="edu-pop mentor-card">
                  <Link to={`/mentors/${m.slug}`} className="mentor-card__top">
                    <img className="mentor-card__avatar" src={m.avatar} alt="" loading="lazy" width="88" height="88" />
                    <div className="mentor-card__who">
                      <h2 className="mentor-card__name">{m.name}</h2>
                      <p className="mentor-card__title">{m.title}</p>
                      <div className="mentor-card__stats">
                        <Rating value={m.rating} count={m.reviewsCount} />
                        <span className="mentor-card__dot" aria-hidden="true">·</span>
                        <span>{m.yearsExperience} yrs</span>
                      </div>
                    </div>
                  </Link>

                  <ul className="mentor-card__tags">
                    {m.expertise.slice(0, 4).map((t) => (
                      <li key={t} className="edu-tag edu-tag--soft">{t}</li>
                    ))}
                  </ul>

                  <p className="mentor-card__langs">
                    <span className="edu-label">Speaks</span> {m.languages.join(', ')}
                  </p>

                  <div className="mentor-card__foot">
                    <div className="mentor-card__price">
                      <MentorPrice price={m.price} />
                      <span className="mentor-card__next">
                        {m.nextAvailable
                          ? <>Next: {formatDateKey(m.nextAvailable.date, 'short')}, {formatSlot(m.nextAvailable.time)} IST</>
                          : 'Fully booked for 3 weeks'}
                      </span>
                    </div>
                    <button
                      className="edu-btn edu-btn--sm edu-btn--accent mentor-card__cta"
                      onClick={() => navigate(`/mentors/${m.slug}`)}
                    >
                      Book a session
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default MentorsPage;
