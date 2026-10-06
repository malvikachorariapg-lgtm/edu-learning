import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { toast } from '../components/Toaster';
import { CATEGORIES } from '../brand';
import { ConfirmModal } from './BookingsPage';
import {
  getEvents,
  getMyEventRegistrations,
  registerForEvent,
  cancelEventRegistration,
  dateParts,
  formatDateTime,
  formatTime,
  currentUser,
  CATEGORY_LABELS,
  EVENT_TYPE_LABELS
} from '../services/communityApi';
import './EventsPage.css';

const pad = (n) => String(n).padStart(2, '0');

const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
};

const Countdown = ({ to, onDone }) => {
  const now = useNow(1000);
  const ms = Math.max(0, new Date(to).getTime() - now);
  useEffect(() => {
    if (ms === 0 && onDone) onDone();
  }, [ms, onDone]);
  const parts = [
    { label: 'Days', value: Math.floor(ms / 864e5) },
    { label: 'Hrs', value: Math.floor((ms % 864e5) / 36e5) },
    { label: 'Min', value: Math.floor((ms % 36e5) / 6e4) },
    { label: 'Sec', value: Math.floor((ms % 6e4) / 1e3) }
  ];
  return (
    <div className="events-countdown" role="timer" aria-label="Time until the event starts">
      {parts.map((p) => (
        <div key={p.label} className="events-countdown__cell">
          <span className="events-countdown__num">{pad(p.value)}</span>
          <span className="events-countdown__label">{p.label}</span>
        </div>
      ))}
    </div>
  );
};

const Seats = ({ event }) => {
  const taken = Math.min(100, Math.round((event.registeredCount / event.capacity) * 100));
  const low = !event.isFull && event.seatsLeft <= Math.max(5, event.capacity * 0.1);
  return (
    <div className={`events-seats${event.isFull ? ' is-full' : low ? ' is-low' : ''}`}>
      <div className="events-seats__bar" aria-hidden="true"><span style={{ width: `${taken}%` }} /></div>
      <span className="events-seats__text">
        {event.isFull ? 'All seats taken' : `${event.seatsLeft} of ${event.capacity} seats left`}
      </span>
    </div>
  );
};

const EventsPage = () => {
  const navigate = useNavigate();
  const user = currentUser();
  const [when, setWhen] = useState('upcoming');
  const [category, setCategory] = useState('all');
  const [events, setEvents] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [registered, setRegistered] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadRegistrations = useCallback(async () => {
    if (!currentUser()) return;
    try {
      const res = await getMyEventRegistrations();
      setRegistered(new Set(res.data.data.filter((r) => r.status === 'registered').map((r) => r.event._id)));
    } catch (e) {
      /* toast already shown */
    }
  }, []);

  useEffect(() => { loadRegistrations(); }, [loadRegistrations]);

  // Hero always shows the next event open for registration, regardless of filters
  const loadFeatured = useCallback(async () => {
    try {
      const res = await getEvents({ when: 'upcoming' }, { silent: true });
      setFeatured(res.data.data.find((e) => e.registrationOpen) || null);
    } catch (e) {
      setFeatured(null);
    }
  }, []);
  useEffect(() => { loadFeatured(); }, [loadFeatured]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const params = { when };
    if (category !== 'all') params.category = category;
    getEvents(params)
      .then((res) => { if (!cancelled) setEvents(res.data.data); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [when, category, reloadKey]);

  const applyEventUpdate = (updated) => {
    if (!updated) return;
    setEvents((list) => list.map((e) => (e._id === updated._id ? updated : e)));
    setFeatured((f) => (f && f._id === updated._id ? updated : f));
  };

  const handleRegister = async (event) => {
    if (!user) {
      toast.info('Log in to save your seat.');
      navigate('/auth', { state: { from: '/events' } });
      return;
    }
    setBusyId(event._id);
    try {
      const res = await registerForEvent(event._id);
      applyEventUpdate(res.data.data.event);
      setRegistered((s) => new Set(s).add(event._id));
      toast.success(`You’re in: ${event.title}. We’ll email the joining link before it starts.`);
    } catch (err) {
      if (err.response?.status === 409) {
        // Already registered or full — resync with the server
        loadRegistrations();
        setReloadKey((k) => k + 1);
        loadFeatured();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async () => {
    const event = confirmCancel;
    setBusyId(event._id);
    try {
      const res = await cancelEventRegistration(event._id);
      applyEventUpdate(res.data.data.event);
      setRegistered((s) => {
        const next = new Set(s);
        next.delete(event._id);
        return next;
      });
      toast.success('Registration cancelled. Your seat has been released.');
      setConfirmCancel(null);
    } catch (err) {
      setConfirmCancel(null);
      loadRegistrations();
    } finally {
      setBusyId(null);
    }
  };

  const chips = [{ key: 'all', label: 'All topics' }, ...CATEGORIES];
  const list = useMemo(
    () => (when === 'upcoming' && featured && category === 'all' ? events.filter((e) => e._id !== featured._id) : events),
    [events, featured, when, category]
  );

  const renderAction = (event, size = 'sm') => {
    const isMine = registered.has(event._id);
    const busy = busyId === event._id;
    const btnSize = size === 'lg' ? 'edu-btn--lg' : 'edu-btn--sm';
    if (event.status === 'past') return <span className="edu-tag edu-tag--soft">Ended</span>;
    if (isMine) {
      return (
        <div className="events-action">
          <span className="edu-tag edu-tag--forest events-action__done">Registered ✓</span>
          {event.registrationOpen && (
            <button className="events-action__cancel" onClick={() => setConfirmCancel(event)} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      );
    }
    if (event.status === 'live') return <span className="edu-tag edu-tag--ochre">Live now</span>;
    if (event.isFull) return <button className={`edu-btn ${btnSize}`} disabled>Full</button>;
    return (
      <button className={`edu-btn edu-btn--accent ${btnSize}`} onClick={() => handleRegister(event)} disabled={busy}>
        {busy ? 'Saving…' : 'Register'}
      </button>
    );
  };

  return (
    <div className="events-page">
      <SiteHeader />

      <header className="events-head">
        <div className="edu-container">
          <div className="events-head__meta">
            <p className="edu-label edu-label--accent">Live events</p>
            <p className="edu-label">Free · Online · Times in IST</p>
          </div>
          <h1 className="edu-display events-head__title">Learn it <em>live.</em></h1>
          <p className="edu-lead">
            Workshops, AMAs and webinars with people who do the work. Every session is free,
            online and small enough that your question gets answered.
          </p>
        </div>
      </header>

      {featured && (
        <section className="events-hero" aria-label="Next event">
          <div className="edu-container">
            <div className="edu-pop events-hero__card">
              <div className="events-hero__main">
                <div className="events-hero__tags">
                  <span className="edu-tag edu-tag--accent">Up next</span>
                  <span className="edu-tag">{EVENT_TYPE_LABELS[featured.type]}</span>
                  <span className="edu-tag edu-tag--soft">{CATEGORY_LABELS[featured.category]}</span>
                </div>
                <h2 className="edu-h2 events-hero__title">{featured.title}</h2>
                <p className="events-hero__summary">{featured.summary}</p>
                <div className="events-host">
                  <img src={featured.host.avatar} alt="" width="44" height="44" />
                  <div>
                    <strong>{featured.host.name}</strong>
                    <span>{featured.host.title}</span>
                  </div>
                </div>
              </div>
              <div className="events-hero__side">
                <p className="edu-label">Starts in</p>
                <Countdown to={featured.startsAt} onDone={loadFeatured} />
                <p className="events-hero__when">
                  {formatDateTime(featured.startsAt)} · {featured.durationMinutes} min
                </p>
                <Seats event={featured} />
                <div className="events-hero__cta">{renderAction(featured, 'lg')}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <nav className="events-filters" aria-label="Filter events">
        <div className="edu-container events-filters__inner">
          <div className="events-when" role="tablist" aria-label="Upcoming or past">
            {['upcoming', 'past'].map((w) => (
              <button
                key={w}
                role="tab"
                aria-selected={when === w}
                className={`events-when__btn${when === w ? ' is-active' : ''}`}
                onClick={() => setWhen(w)}
              >
                {w === 'upcoming' ? 'Upcoming' : 'Past'}
              </button>
            ))}
          </div>
          <div className="events-chips">
            {chips.map((c) => (
              <button
                key={c.key}
                className={`events-chip${category === c.key ? ' is-active' : ''}`}
                aria-pressed={category === c.key}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="events-main">
        <div className="edu-container">
          {loading ? (
            <div className="edu-loading events-loading"><div className="edu-spinner" role="status" aria-label="Loading events" /></div>
          ) : failed ? (
            <div className="edu-empty events-empty">
              <h2 className="edu-h2">Couldn’t load <em>events.</em></h2>
              <button className="edu-btn" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </div>
          ) : list.length === 0 ? (
            <div className="edu-empty events-empty">
              <h2 className="edu-h2">
                {when === 'upcoming' ? <>Nothing else <em>scheduled.</em></> : <>No past <em>events.</em></>}
              </h2>
              <p className="edu-muted">
                {category !== 'all' ? 'Try another topic.' : 'New sessions are added every week — check back soon.'}
              </p>
              {category !== 'all' && <button className="edu-btn" onClick={() => setCategory('all')}>Show all topics</button>}
            </div>
          ) : (
            <ol className="events-list">
              {list.map((e) => {
                const d = dateParts(e.startsAt);
                const open = expanded === e._id;
                return (
                  <li key={e._id} className={`events-card${e.status === 'past' ? ' is-past' : ''}`}>
                    <div className="events-card__date" aria-hidden="true">
                      <span>{d.weekday}</span>
                      <strong>{d.day}</strong>
                      <span>{d.month}</span>
                    </div>
                    <div className="events-card__body">
                      <div className="events-card__tags">
                        <span className="edu-tag">{EVENT_TYPE_LABELS[e.type]}</span>
                        <span className="edu-tag edu-tag--soft">{CATEGORY_LABELS[e.category]}</span>
                        <span className="edu-tag edu-tag--soft">{e.level}</span>
                        {e.status === 'live' && <span className="edu-tag edu-tag--ochre">Live now</span>}
                      </div>
                      <h3 className="events-card__title">{e.title}</h3>
                      <p className="events-card__time">
                        {formatTime(e.startsAt)} – {formatTime(e.endsAt)} IST · {e.durationMinutes} min · Online
                      </p>
                      <p className="events-card__summary">{e.summary}</p>
                      <div className="events-host events-host--sm">
                        <img src={e.host.avatar} alt="" width="32" height="32" loading="lazy" />
                        <div>
                          <strong>{e.host.name}</strong>
                          <span>{e.host.title}</span>
                        </div>
                      </div>
                      {open && (
                        <div className="events-card__more">
                          <p>{e.description}</p>
                          {e.agenda?.length > 0 && (
                            <>
                              <p className="edu-label">Agenda</p>
                              <ol>{e.agenda.map((a) => <li key={a}>{a}</li>)}</ol>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        className="events-card__toggle"
                        onClick={() => setExpanded(open ? null : e._id)}
                        aria-expanded={open}
                      >
                        {open ? 'Hide details' : 'Details & agenda'}
                      </button>
                    </div>
                    <div className="events-card__side">
                      {e.status !== 'past' && <Seats event={e} />}
                      {e.status === 'past' && <p className="events-card__attended">{e.registeredCount} attended</p>}
                      {renderAction(e)}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </main>

      <ConfirmModal
        open={Boolean(confirmCancel)}
        title="Cancel your registration?"
        body={confirmCancel && <>Your seat for <strong>{confirmCancel.title}</strong> on {formatDateTime(confirmCancel.startsAt)} will be released for someone else.</>}
        confirmLabel="Cancel registration"
        cancelLabel="Keep my seat"
        busy={Boolean(confirmCancel && busyId === confirmCancel._id)}
        onConfirm={handleCancel}
        onClose={() => setConfirmCancel(null)}
      />

      <SiteFooter />
    </div>
  );
};

export default EventsPage;
