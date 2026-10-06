import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { toast } from '../components/Toaster';
import {
  getMyMentorBookings,
  getMyEventRegistrations,
  cancelMentorBooking,
  cancelEventRegistration,
  dateParts,
  formatDateTime,
  formatTime,
  googleCalendarUrl,
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS
} from '../services/communityApi';
import './BookingsPage.css';

// Small confirmation dialog shared by the bookings and events pages
export const ConfirmModal = ({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Go back', busy, onConfirm, onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="edu-modal-overlay bk-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="edu-modal bk-modal" role="dialog" aria-modal="true" aria-labelledby="bk-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="edu-modal__head">
          <h2 id="bk-modal-title" className="edu-h4 bk-modal__title">{title}</h2>
          <button className="edu-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>
        <div className="edu-modal__body bk-modal__body">{body}</div>
        <div className="edu-modal__foot bk-modal__foot">
          <button className="edu-btn edu-btn--ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className="edu-btn edu-btn--danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Cancelling…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const DateBlock = ({ date, muted }) => {
  const d = dateParts(date);
  return (
    <div className={`bk-date${muted ? ' is-muted' : ''}`} aria-hidden="true">
      <span>{d.weekday}</span>
      <strong>{d.day}</strong>
      <span>{d.month}</span>
    </div>
  );
};

const sessionStatus = (b) => {
  if (b.status === 'cancelled') return { label: 'Cancelled', cls: 'edu-tag--soft' };
  if (b.isUpcoming) {
    return new Date(b.startsAt).getTime() <= Date.now()
      ? { label: 'In progress', cls: 'edu-tag--ochre' }
      : { label: 'Confirmed', cls: 'edu-tag--forest' };
  }
  return { label: 'Completed', cls: 'edu-tag--soft' };
};

const registrationStatus = (r) => {
  if (r.status === 'cancelled') return { label: 'Cancelled', cls: 'edu-tag--soft' };
  if (r.event.status === 'live') return { label: 'Live now', cls: 'edu-tag--ochre' };
  if (r.event.status === 'past') return { label: 'Attended', cls: 'edu-tag--soft' };
  return { label: 'Registered', cls: 'edu-tag--forest' };
};

const BookingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'events' ? 'events' : 'sessions';
  const [sessions, setSessions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(null); // { kind, item }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [s, r] = await Promise.all([getMyMentorBookings(), getMyEventRegistrations()]);
      setSessions(s.data.data);
      setRegistrations(r.data.data);
    } catch (e) {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setTab = (key) => setSearchParams(key === 'events' ? { tab: 'events' } : {}, { replace: true });

  const upcomingSessions = sessions.filter((b) => b.isUpcoming);
  const pastSessions = sessions.filter((b) => !b.isUpcoming).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const upcomingEvents = registrations.filter((r) => r.status === 'registered' && r.event.status !== 'past');
  const pastEvents = registrations
    .filter((r) => !(r.status === 'registered' && r.event.status !== 'past'))
    .sort((a, b) => new Date(b.event.startsAt) - new Date(a.event.startsAt));
  const hoursBooked = upcomingSessions.reduce((sum, b) => sum + (b.durationMinutes || 30), 0) / 60;

  const confirmCancel = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'session') {
        const res = await cancelMentorBooking(pending.item._id);
        setSessions((list) => list.map((b) => (b._id === pending.item._id ? res.data.data : b)));
        toast.success(`Session with ${pending.item.mentor?.name || 'your mentor'} cancelled.`);
      } else {
        const res = await cancelEventRegistration(pending.item.event._id);
        setRegistrations((list) => list.map((r) => (r._id === pending.item._id ? res.data.data : r)));
        toast.success('Registration cancelled. Your seat has been released.');
      }
      setPending(null);
    } catch (e) {
      // Error is toasted by the API client; refresh in case the state changed elsewhere
      setPending(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const renderSession = (b) => {
    const status = sessionStatus(b);
    const m = b.mentor || {};
    const showCutoffNote = b.isUpcoming && !b.canCancel && new Date(b.startsAt).getTime() > Date.now();
    return (
      <li key={b._id} className={`bk-item${b.isUpcoming ? '' : ' is-past'}`}>
        <DateBlock date={b.startsAt} muted={!b.isUpcoming} />
        <div className="bk-item__body">
          <div className="bk-item__tags">
            <span className={`edu-tag ${status.cls}`}>{status.label}</span>
            <span className="edu-tag edu-tag--soft">{b.price > 0 ? `₹${b.price.toLocaleString('en-IN')}` : 'Free intro'}</span>
          </div>
          <h3 className="bk-item__title">
            {m.slug ? <Link to={`/mentors/${m.slug}`}>{b.topic}</Link> : b.topic}
          </h3>
          <p className="bk-item__time">{formatTime(b.startsAt)} – {formatTime(b.endsAt)} IST · {b.durationMinutes || 30} min · Video call</p>
          <div className="bk-person">
            {m.avatar && <img src={m.avatar} alt="" width="36" height="36" loading="lazy" />}
            <div>
              <strong>{m.name || 'Mentor'}</strong>
              <span>{m.title}</span>
            </div>
          </div>
          {b.notes && <p className="bk-item__notes">“{b.notes}”</p>}
          <p className="bk-item__ref">Ref <span className="edu-mono">{b.reference}</span></p>
          {showCutoffNote && (
            <p className="bk-item__note">Starts within 12 hours, so it can no longer be cancelled online. Contact <Link to="/support">support</Link> if you can’t make it.</p>
          )}
        </div>
        {b.isUpcoming && (
          <div className="bk-item__actions">
            <a
              className="edu-btn edu-btn--sm edu-btn--ghost"
              href={googleCalendarUrl({
                title: `Mentor session with ${m.name || 'your mentor'}`,
                details: `Topic: ${b.topic}\nReference: ${b.reference}`,
                start: b.startsAt,
                end: b.endsAt
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to calendar
            </a>
            {b.canCancel && (
              <button className="edu-btn edu-btn--sm edu-btn--danger" onClick={() => setPending({ kind: 'session', item: b })}>
                Cancel
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const renderRegistration = (r) => {
    const e = r.event;
    const status = registrationStatus(r);
    const active = r.status === 'registered' && e.status !== 'past';
    return (
      <li key={r._id} className={`bk-item${active ? '' : ' is-past'}`}>
        <DateBlock date={e.startsAt} muted={!active} />
        <div className="bk-item__body">
          <div className="bk-item__tags">
            <span className={`edu-tag ${status.cls}`}>{status.label}</span>
            <span className="edu-tag edu-tag--soft">{EVENT_TYPE_LABELS[e.type]}</span>
            <span className="edu-tag edu-tag--soft">{CATEGORY_LABELS[e.category]}</span>
          </div>
          <h3 className="bk-item__title"><Link to="/events">{e.title}</Link></h3>
          <p className="bk-item__time">{formatTime(e.startsAt)} – {formatTime(e.endsAt)} IST · {e.durationMinutes} min · Online</p>
          <div className="bk-person">
            {e.host?.avatar && <img src={e.host.avatar} alt="" width="36" height="36" loading="lazy" />}
            <div>
              <strong>{e.host?.name}</strong>
              <span>Host · {e.host?.title}</span>
            </div>
          </div>
        </div>
        {active && (
          <div className="bk-item__actions">
            <a
              className="edu-btn edu-btn--sm edu-btn--ghost"
              href={googleCalendarUrl({ title: e.title, details: e.summary, start: e.startsAt, end: e.endsAt })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to calendar
            </a>
            {e.registrationOpen && (
              <button className="edu-btn edu-btn--sm edu-btn--danger" onClick={() => setPending({ kind: 'event', item: r })}>
                Cancel
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const section = (title, items, render) =>
    items.length > 0 && (
      <section className="bk-section">
        <h2 className="edu-label edu-label--ink bk-section__title">
          {title} <span>{String(items.length).padStart(2, '0')}</span>
        </h2>
        <ul className="bk-list">{items.map(render)}</ul>
      </section>
    );

  const isSessions = tab === 'sessions';
  const upcoming = isSessions ? upcomingSessions : upcomingEvents;
  const past = isSessions ? pastSessions : pastEvents;

  return (
    <AppShell nav={learnerNav('bookings')} eyebrow="Mentors & live events" title="My bookings">
      <div className="bk-page">
        {loading ? (
          <div className="edu-loading bk-loading"><div className="edu-spinner" role="status" aria-label="Loading bookings" /></div>
        ) : failed ? (
          <div className="edu-empty">
            <h2 className="edu-h3">Couldn’t load your bookings.</h2>
            <button className="edu-btn" onClick={() => { setLoading(true); load(); }}>Try again</button>
          </div>
        ) : (
          <>
            <div className="edu-stats bk-stats">
              <div className="edu-stat">
                <p className="edu-label">Upcoming sessions</p>
                <p className="edu-stat__value">{upcomingSessions.length}</p>
                <p className="edu-stat__note">{upcomingSessions[0] ? `Next: ${formatDateTime(upcomingSessions[0].startsAt)}` : 'Nothing booked yet'}</p>
              </div>
              <div className="edu-stat">
                <p className="edu-label">Upcoming events</p>
                <p className="edu-stat__value">{upcomingEvents.length}</p>
                <p className="edu-stat__note">{upcomingEvents[0] ? `Next: ${formatDateTime(upcomingEvents[0].event.startsAt)}` : 'No seats saved'}</p>
              </div>
              <div className="edu-stat">
                <p className="edu-label">Mentor time booked</p>
                <p className="edu-stat__value">{hoursBooked % 1 === 0 ? hoursBooked : hoursBooked.toFixed(1)}<small> hrs</small></p>
                <p className="edu-stat__note">Across upcoming sessions</p>
              </div>
            </div>

            <div className="bk-tabs" role="tablist" aria-label="Booking type">
              <button role="tab" aria-selected={isSessions} className={`bk-tab${isSessions ? ' is-active' : ''}`} onClick={() => setTab('sessions')}>
                Mentor sessions <span>{upcomingSessions.length}</span>
              </button>
              <button role="tab" aria-selected={!isSessions} className={`bk-tab${!isSessions ? ' is-active' : ''}`} onClick={() => setTab('events')}>
                Events <span>{upcomingEvents.length}</span>
              </button>
            </div>

            {upcoming.length === 0 && (
              <div className="edu-empty bk-empty">
                <h2 className="edu-h3">
                  {isSessions ? <>No upcoming <em>sessions.</em></> : <>No upcoming <em>events.</em></>}
                </h2>
                <p className="edu-muted">
                  {isSessions
                    ? 'Book a 30-minute call with a mentor — several offer a free intro.'
                    : 'Save a seat at a free workshop, AMA or webinar.'}
                </p>
                <Link to={isSessions ? '/mentors' : '/events'} className="edu-btn edu-btn--accent">
                  {isSessions ? 'Find a mentor' : 'Browse live events'}
                </Link>
              </div>
            )}

            {section('Upcoming', upcoming, isSessions ? renderSession : renderRegistration)}
            {section('Past & cancelled', past, isSessions ? renderSession : renderRegistration)}
          </>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pending)}
        title={pending?.kind === 'session' ? 'Cancel this session?' : 'Cancel your registration?'}
        body={pending && (pending.kind === 'session' ? (
          <p>
            Your session with <strong>{pending.item.mentor?.name}</strong> on {formatDateTime(pending.item.startsAt)} will be
            cancelled and the slot released. {pending.item.price > 0 ? 'You won’t be charged.' : ''}
          </p>
        ) : (
          <p>
            Your seat for <strong>{pending.item.event.title}</strong> on {formatDateTime(pending.item.event.startsAt)} will be released.
            You can register again later if seats are still available.
          </p>
        ))}
        confirmLabel={pending?.kind === 'session' ? 'Cancel session' : 'Cancel registration'}
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={confirmCancel}
        onClose={() => setPending(null)}
      />
    </AppShell>
  );
};

export default BookingsPage;
