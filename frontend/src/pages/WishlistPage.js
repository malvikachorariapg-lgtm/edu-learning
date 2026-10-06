import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { toast } from '../components/Toaster';
import api from '../services/api';
import {
  getWishlist,
  removeWishlistItem,
  loadSavedIds,
  getStoredUser,
  thumbUrl,
  FALLBACK_THUMB,
  formatPrice,
  formatRating
} from '../services/catalogApi';
import './WishlistPage.css';

const pad = (n) => String(n).padStart(2, '0');

const savedOn = (d) => {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'Saved today';
  if (days === 1) return 'Saved yesterday';
  if (days < 30) return `Saved ${days} days ago`;
  return `Saved ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

const WishlistPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [enrolledIds, setEnrolledIds] = useState(new Set());

  const fetchWishlist = useCallback(async () => {
    try {
      const res = await getWishlist();
      setItems(res.data.data || []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWishlist();
    const user = getStoredUser();
    if (user?.id) {
      api.get(`/auth/profile/${user.id}`, { silent: true })
        .then((res) => {
          const ids = (res.data?.user?.enrolledCourses || []).map((e) => String(e.courseId?._id || e.courseId));
          setEnrolledIds(new Set(ids));
        })
        .catch(() => {});
    }
  }, [fetchWishlist]);

  const handleRemove = async (course, index) => {
    setRemoving(course._id);
    try {
      await removeWishlistItem(index);
      toast.success(`Removed “${course.title}” from your wishlist`);
      await fetchWishlist();
      loadSavedIds(true);
    } catch {
      // the API layer already surfaced the error
    } finally {
      setRemoving(null);
    }
  };

  const total = items.reduce((sum, c) => sum + (Number(c.price) || 0), 0);

  return (
    <AppShell
      nav={learnerNav('wishlist')}
      eyebrow="Saved for later"
      title="Wishlist"
      actions={<Link to="/courses" className="edu-btn edu-btn--sm wl-browse">Browse programs</Link>}
    >
      <div className="wl-page">
        {loading ? (
          <div className="edu-loading wl-loading">
            <div className="edu-spinner" role="status" aria-label="Loading wishlist" />
            <p className="edu-label">Loading your wishlist</p>
          </div>
        ) : failed ? (
          <div className="edu-empty wl-empty">
            <h2 className="edu-h3">We couldn't load <em>your wishlist.</em></h2>
            <p className="edu-muted">Check your connection and try again.</p>
            <button className="edu-btn" onClick={() => { setLoading(true); fetchWishlist(); }}>Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="edu-empty wl-empty">
            <span className="wl-empty__icon" aria-hidden="true">♡</span>
            <h2 className="edu-h2">Nothing saved <em>yet.</em></h2>
            <p className="edu-muted">Tap the heart on any program to keep it here while you decide.</p>
            <Link to="/courses" className="edu-btn edu-btn--accent">Explore programs →</Link>
          </div>
        ) : (
          <>
            <div className="wl-summary">
              <div>
                <p className="edu-label">Saved programs</p>
                <strong className="wl-summary__num">{pad(items.length)}</strong>
              </div>
              <div>
                <p className="edu-label">Combined fee</p>
                <strong className="wl-summary__num">{formatPrice(total)}</strong>
              </div>
              <p className="edu-muted wl-summary__note">Most recently saved first.</p>
            </div>

            <ol className="wl-list">
              {items.map((course, index) => {
                const enrolled = enrolledIds.has(String(course._id));
                const busy = removing === course._id;
                return (
                  <li key={course._id} className={`wl-item edu-panel${busy ? ' is-busy' : ''}`}>
                    <Link to={`/courses/${course._id}`} className="wl-item__media" tabIndex={-1} aria-hidden="true">
                      <img
                        src={thumbUrl(course.thumbnail)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_THUMB; }}
                      />
                    </Link>

                    <div className="wl-item__body">
                      <div className="wl-item__tags">
                        {course.category && <span className="edu-tag edu-tag--solid">{course.category}</span>}
                        {course.level && <span className="edu-tag">{course.level}</span>}
                        {enrolled && <span className="edu-tag edu-tag--forest">Enrolled</span>}
                      </div>
                      <h2 className="wl-item__title">
                        <Link to={`/courses/${course._id}`}>{course.title}</Link>
                      </h2>
                      <p className="wl-item__meta">
                        {course.instructor && <span>with {course.instructor}</span>}
                        {course.duration && <span>{course.duration}</span>}
                        {course.ratingCount > 0 && (
                          <span><span className="wl-item__star" aria-hidden="true">★</span>{formatRating(course.ratingAvg)} ({course.ratingCount})</span>
                        )}
                      </p>
                      <p className="wl-item__saved">{savedOn(course.addedAt)}</p>
                    </div>

                    <div className="wl-item__side">
                      <strong className="wl-item__price">{formatPrice(course.price)}</strong>
                      <div className="wl-item__actions">
                        {enrolled ? (
                          <button className="edu-btn edu-btn--sm" onClick={() => navigate(`/lms/${course._id}`)}>
                            Go to classroom
                          </button>
                        ) : (
                          <button
                            className="edu-btn edu-btn--accent edu-btn--sm"
                            onClick={() => navigate(`/payment/${course._id}`)}
                            aria-label={`Enroll in ${course.title}`}
                          >
                            Enroll →
                          </button>
                        )}
                        <button
                          className="edu-btn edu-btn--ghost edu-btn--sm"
                          onClick={() => handleRemove(course, index)}
                          disabled={Boolean(removing)}
                          aria-label={`Remove ${course.title} from wishlist`}
                        >
                          {busy ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default WishlistPage;
