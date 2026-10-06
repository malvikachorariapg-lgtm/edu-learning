import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from './Toaster';
import {
  addToWishlist,
  removeWishlistCourse,
  isSignedIn,
  loadSavedIds,
  setSaved,
  subscribeSaved
} from '../services/catalogApi';
import './WishlistButton.css';

/**
 * Heart toggle for saving a course.
 * variant: 'tile' (round, sits on a course card image) | 'hero' (labelled button)
 */
const WishlistButton = ({ courseId, courseTitle = 'this course', variant = 'tile', className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSavedState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSavedIds().then((ids) => { if (alive) setSavedState(ids.has(String(courseId))); });
    const unsubscribe = subscribeSaved((ids) => setSavedState(Boolean(ids && ids.has(String(courseId)))));
    return () => { alive = false; unsubscribe(); };
  }, [courseId]);

  const handleClick = async (e) => {
    e.preventDefault();
    if (busy) return;

    if (!isSignedIn()) {
      toast.info('Log in to save courses to your wishlist.');
      navigate('/auth', { state: { from: location.pathname } });
      return;
    }

    setBusy(true);
    try {
      if (saved) {
        await removeWishlistCourse(courseId);
        setSaved(courseId, false);
        toast.success('Removed from wishlist');
      } else {
        await addToWishlist(courseId);
        setSaved(courseId, true);
        toast.success('Saved to wishlist');
      }
    } catch (err) {
      // Already saved elsewhere (another tab): reflect the server state
      if (err.response?.status === 409) setSaved(courseId, true);
    } finally {
      setBusy(false);
    }
  };

  const label = saved ? `Remove ${courseTitle} from wishlist` : `Save ${courseTitle} to wishlist`;

  return (
    <button
      type="button"
      className={`wish-btn wish-btn--${variant}${saved ? ' is-saved' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? 'Saved — tap to remove' : 'Save to wishlist'}
      disabled={busy}
    >
      <svg className="wish-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.1 3.4 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.6 0 5.5 3.6 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
      </svg>
      {variant === 'hero' && <span className="wish-btn__text">{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
};

export default WishlistButton;
