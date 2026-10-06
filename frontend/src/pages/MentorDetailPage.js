import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { toast } from '../components/Toaster';
import { MentorPrice, Rating } from './MentorsPage';
import {
  getMentor,
  getMentorSlots,
  bookMentor,
  dateKeyParts,
  formatDateKey,
  formatSlot,
  formatTime,
  googleCalendarUrl,
  downloadIcs,
  currentUser,
  CATEGORY_LABELS
} from '../services/communityApi';
import './MentorsPage.css';
import './MentorDetailPage.css';

const STRIP_DAYS = 14;
const OTHER_TOPIC = 'Something else';
const NOTES_MAX = 1000;

const MentorDetailPage = () => {
  const { mentorId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [date, setDate] = useState(searchParams.get('date') || '');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState(searchParams.get('time') || '');
  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState('pick'); // pick | confirm | done
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);

  const loadMentor = useCallback(async () => {
    try {
      const res = await getMentor(mentorId);
      setMentor(res.data.data);
      return res.data.data;
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [mentorId]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    loadMentor();
  }, [loadMentor]);

  const days = useMemo(() => (mentor?.days || []).slice(0, STRIP_DAYS), [mentor]);

  // Default to the requested date, or the first date with open slots
  useEffect(() => {
    if (!days.length) return;
    if (date && days.some((d) => d.date === date)) return;
    const firstOpen = days.find((d) => d.open > 0) || days[0];
    setDate(firstOpen.date);
  }, [days, date]);

  const loadSlots = useCallback(async (forDate) => {
    if (!forDate || !mentor) return [];
    setSlotsLoading(true);
    try {
      const res = await getMentorSlots(mentor.slug, forDate);
      setSlots(res.data.data.slots);
      return res.data.data.slots;
    } catch (err) {
      setSlots([]);
      return [];
    } finally {
      setSlotsLoading(false);
    }
  }, [mentor]);

  useEffect(() => {
    if (!date || !mentor) return;
    loadSlots(date).then((list) => {
      // Drop a pre-selected time if it isn't bookable any more
      setTime((t) => (t && list.some((s) => s.time === t && s.status === 'open') ? t : ''));
    });
  }, [date, mentor, loadSlots]);

  const topics = useMemo(() => [...(mentor?.topics || []), OTHER_TOPIC], [mentor]);
  const selectedSlot = slots.find((s) => s.time === time);
  const endsAt = selectedSlot
    ? new Date(new Date(selectedSlot.startsAt).getTime() + (mentor?.sessionMinutes || 30) * 60000)
    : null;
  const canContinue = Boolean(date && selectedSlot && selectedSlot.status === 'open' && topic);

  const pickDate = (key) => {
    setDate(key);
    setTime('');
    if (step !== 'pick') setStep('pick');
  };

  const handleContinue = () => {
    if (!canContinue) return;
    if (!currentUser()) {
      const params = new URLSearchParams({ date, time, topic });
      toast.info('Log in to book your session — we’ll keep your slot selection.');
      navigate('/auth', { state: { from: `/mentors/${mentor.slug}?${params.toString()}` } });
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await bookMentor(mentor.slug, { date, time, topic, notes: notes.trim() });
      setBooking(res.data.data);
      setStep('done');
      toast.success(res.data.message || 'Session booked');
      if (searchParams.toString()) setSearchParams({}, { replace: true });
      loadMentor();
    } catch (err) {
      if (err.response?.status === 409 || err.response?.status === 400) {
        // Slot went away (or overlaps) — refresh the grid so the learner can pick again
        setStep('pick');
        setTime('');
        loadSlots(date);
        loadMentor();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetBooking = () => {
    setBooking(null);
    setTime('');
    setNotes('');
    setStep('pick');
    loadSlots(date);
  };

  if (loading) {
    return (
      <div className="mentor-detail">
        <SiteHeader />
        <div className="edu-loading mentor-detail__loading"><div className="edu-spinner" role="status" aria-label="Loading mentor" /></div>
      </div>
    );
  }

  if (!mentor) {
    return (
      <div className="mentor-detail">
        <SiteHeader />
        <div className="edu-container mentor-detail__missing">
          <div className="edu-empty">
            <h1 className="edu-h2">{notFound ? <>Mentor <em>not found.</em></> : <>Couldn’t load <em>this mentor.</em></>}</h1>
            <p className="edu-muted">{notFound ? 'This profile may have moved or is no longer taking sessions.' : 'Please try again in a moment.'}</p>
            <Link to="/mentors" className="edu-btn">Browse mentors</Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const calendarEvent = booking && {
    uid: booking._id,
    title: `Mentor session with ${mentor.name}`,
    details: `Topic: ${booking.topic}\nReference: ${booking.reference}\nThe video link will be emailed 1 hour before the session.`,
    start: booking.startsAt,
    end: booking.endsAt
  };

  return (
    <div className="mentor-detail">
      <SiteHeader />

      <div className="edu-container">
        <nav className="mentor-detail__crumbs" aria-label="Breadcrumb">
          <Link to="/mentors" className="mentor-detail__back">← All mentors</Link>
        </nav>

        <div className="mentor-detail__layout">
          {/* ---------- Profile ---------- */}
          <section className="mentor-profile">
            <header className="mentor-profile__head">
              <img className="mentor-profile__avatar" src={mentor.avatar} alt={mentor.name} width="160" height="160" />
              <div className="mentor-profile__id">
                <p className="edu-label edu-label--accent">
                  {mentor.categories.map((c) => CATEGORY_LABELS[c] || c).join(' · ')}
                </p>
                <h1 className="edu-h2 mentor-profile__name">{mentor.name}</h1>
                <p className="mentor-profile__title">{mentor.title}</p>
                <div className="mentor-profile__price"><MentorPrice price={mentor.price} /></div>
                <a href="#book" className="edu-btn edu-btn--sm edu-btn--accent mentor-profile__jump"
                  onClick={(e) => { e.preventDefault(); document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' }); }}>
                  Book a session ↓
                </a>
              </div>
            </header>

            <dl className="edu-stats mentor-profile__stats">
              <div className="edu-stat">
                <dt className="edu-label">Rating</dt>
                <dd className="mentor-profile__stat"><Rating value={mentor.rating} /></dd>
                <dd className="edu-stat__note">{mentor.reviewsCount} reviews</dd>
              </div>
              <div className="edu-stat">
                <dt className="edu-label">Experience</dt>
                <dd className="mentor-profile__stat">{mentor.yearsExperience} yrs</dd>
                <dd className="edu-stat__note">{mentor.city}</dd>
              </div>
              <div className="edu-stat">
                <dt className="edu-label">Sessions</dt>
                <dd className="mentor-profile__stat">{mentor.sessionsCount}</dd>
                <dd className="edu-stat__note">on Edu Learning</dd>
              </div>
            </dl>

            <div className="mentor-profile__block">
              <p className="edu-label">About</p>
              <p className="mentor-profile__bio">{mentor.bio}</p>
              {mentor.highlights?.length > 0 && (
                <ul className="mentor-profile__highlights">
                  {mentor.highlights.map((h) => <li key={h}>{h}</li>)}
                </ul>
              )}
            </div>

            <div className="mentor-profile__block">
              <p className="edu-label">Expertise</p>
              <ul className="mentor-profile__tags">
                {mentor.expertise.map((t) => <li key={t} className="edu-tag">{t}</li>)}
              </ul>
            </div>

            <div className="mentor-profile__block mentor-profile__grid">
              <div>
                <p className="edu-label">Good sessions for</p>
                <ul className="mentor-profile__list">
                  {mentor.topics.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div>
                <p className="edu-label">Languages</p>
                <p className="mentor-profile__langs">{mentor.languages.join(', ')}</p>
              </div>
            </div>

            <div className="mentor-profile__block mentor-profile__how">
              <p className="edu-label">How it works</p>
              <ol>
                <li><strong>Pick a slot.</strong> All times are in IST. Sessions run for {mentor.sessionMinutes || 30} minutes on video.</li>
                <li><strong>Share context.</strong> A line or two in the notes helps {mentor.name.split(' ')[0]} prepare.</li>
                <li><strong>Join the call.</strong> The joining link is emailed one hour before you start.</li>
                <li><strong>Plans change?</strong> Cancel free of charge up to {mentor.cancelCutoffHours || 12} hours before the session.</li>
              </ol>
            </div>
          </section>

          {/* ---------- Booking widget ---------- */}
          <aside className="mentor-book" id="book" aria-label="Book a session">
            <div className="edu-panel mentor-book__panel">
              {step === 'done' && booking ? (
                <div className="mentor-book__done">
                  <span className="mentor-book__check" aria-hidden="true">✓</span>
                  <p className="edu-label edu-label--accent">Booking confirmed</p>
                  <h2 className="edu-h3">You’re booked with <em>{mentor.name.split(' ')[0]}.</em></h2>

                  <dl className="mentor-book__summary">
                    <div><dt>Date</dt><dd>{formatDateKey(booking.date)}</dd></div>
                    <div><dt>Time</dt><dd>{formatSlot(booking.time)} – {formatTime(booking.endsAt)} IST</dd></div>
                    <div><dt>Topic</dt><dd>{booking.topic}</dd></div>
                    <div><dt>Where</dt><dd>Video call · link emailed 1 hour before</dd></div>
                    <div><dt>Reference</dt><dd className="edu-mono">{booking.reference}</dd></div>
                    <div><dt>Price</dt><dd>{booking.price > 0 ? `₹${booking.price.toLocaleString('en-IN')}, charged after the session` : 'Free intro'}</dd></div>
                  </dl>

                  <div className="mentor-book__cal">
                    <a className="edu-btn edu-btn--sm" href={googleCalendarUrl(calendarEvent)} target="_blank" rel="noopener noreferrer">
                      Add to Google Calendar
                    </a>
                    <button className="edu-btn edu-btn--sm edu-btn--ghost" onClick={() => downloadIcs(calendarEvent, `session-${booking.reference}.ics`)}>
                      Download .ics
                    </button>
                  </div>

                  <div className="mentor-book__done-foot">
                    <Link to="/bookings" className="edu-btn edu-btn--accent edu-btn--block">View my bookings</Link>
                    <button className="edu-link mentor-book__again" onClick={resetBooking}>Book another session</button>
                  </div>
                </div>
              ) : step === 'confirm' && selectedSlot ? (
                <div className="mentor-book__confirm">
                  <p className="edu-label edu-label--accent">Step 2 of 2</p>
                  <h2 className="edu-h3">Confirm your <em>session.</em></h2>
                  <dl className="mentor-book__summary">
                    <div><dt>Mentor</dt><dd>{mentor.name}</dd></div>
                    <div><dt>Date</dt><dd>{formatDateKey(date)}</dd></div>
                    <div><dt>Time</dt><dd>{formatSlot(time)} – {formatTime(endsAt)} IST</dd></div>
                    <div><dt>Topic</dt><dd>{topic}</dd></div>
                    {notes.trim() && <div><dt>Notes</dt><dd className="mentor-book__notes">{notes.trim()}</dd></div>}
                    <div><dt>Price</dt><dd><MentorPrice price={mentor.price} /></dd></div>
                  </dl>
                  <p className="mentor-book__policy">
                    {mentor.price > 0 ? 'Charged after the session is held. ' : ''}
                    Free cancellation up to {mentor.cancelCutoffHours || 12} hours before the start time.
                  </p>
                  <div className="mentor-book__actions">
                    <button className="edu-btn edu-btn--ghost" onClick={() => setStep('pick')} disabled={submitting}>Back</button>
                    <button className="edu-btn edu-btn--accent" onClick={handleConfirm} disabled={submitting}>
                      {submitting ? 'Booking…' : 'Confirm booking'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mentor-book__pick">
                  <div className="mentor-book__head">
                    <div>
                      <p className="edu-label edu-label--accent">Book a session</p>
                      <h2 className="edu-h3">Pick a <em>time.</em></h2>
                    </div>
                    <span className="edu-tag">Times in IST</span>
                  </div>

                  <p className="edu-label mentor-book__step">1 · Date</p>
                  <div className="mentor-book__dates" role="listbox" aria-label="Choose a date">
                    {days.map((d) => {
                      const parts = dateKeyParts(d.date);
                      const disabled = d.open === 0;
                      const active = d.date === date;
                      return (
                        <button
                          key={d.date}
                          role="option"
                          aria-selected={active}
                          className={`mentor-date${active ? ' is-active' : ''}${disabled ? ' is-empty' : ''}`}
                          onClick={() => pickDate(d.date)}
                          disabled={disabled}
                          title={disabled ? (d.total ? 'Fully booked' : 'Not available') : `${d.open} open`}
                        >
                          <span className="mentor-date__dow">{parts.weekday}</span>
                          <span className="mentor-date__day">{parts.day}</span>
                          <span className="mentor-date__mon">{parts.month}</span>
                          <span className="mentor-date__open">{d.total === 0 ? '—' : d.open === 0 ? 'Full' : `${d.open} open`}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="edu-label mentor-book__step">
                    2 · Time {date && <span className="mentor-book__for">— {formatDateKey(date, 'short')}</span>}
                  </p>
                  {slotsLoading && slots.length === 0 ? (
                    <div className="mentor-book__slots-loading"><span className="edu-spinner" /></div>
                  ) : slots.length === 0 ? (
                    <p className="mentor-book__none">{mentor.name.split(' ')[0]} isn’t available on this day. Try another date.</p>
                  ) : (
                    <div className={`mentor-book__slots${slotsLoading ? ' is-refreshing' : ''}`}>
                      {slots.map((s) => {
                        const open = s.status === 'open';
                        return (
                          <button
                            key={s.time}
                            className={`mentor-slot${time === s.time ? ' is-active' : ''} is-${s.status}`}
                            disabled={!open}
                            aria-pressed={time === s.time}
                            onClick={() => setTime(s.time)}
                          >
                            <span>{formatSlot(s.time)}</span>
                            {!open && (
                              <small>{s.status === 'yours' ? 'Your booking' : s.status === 'booked' ? 'Taken' : 'Passed'}</small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className="edu-label mentor-book__step">3 · What to talk about</p>
                  <div className="edu-field mentor-book__field">
                    <label htmlFor="mb-topic">Topic</label>
                    <select id="mb-topic" className="edu-select" value={topic} onChange={(e) => setTopic(e.target.value)}>
                      <option value="">Choose a topic</option>
                      {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="edu-field mentor-book__field">
                    <label htmlFor="mb-notes">Notes for {mentor.name.split(' ')[0]} <span className="mentor-book__optional">(optional)</span></label>
                    <textarea
                      id="mb-notes"
                      className="edu-textarea"
                      rows={3}
                      maxLength={NOTES_MAX}
                      placeholder="What are you working on? Links to a CV or project are welcome."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <span className="mentor-book__count">{notes.length}/{NOTES_MAX}</span>
                  </div>

                  <div className="mentor-book__total">
                    <span className="edu-label">{mentor.sessionMinutes || 30}-minute session</span>
                    <MentorPrice price={mentor.price} />
                  </div>
                  <button className="edu-btn edu-btn--accent edu-btn--block edu-btn--lg" onClick={handleContinue} disabled={!canContinue}>
                    {!selectedSlot ? 'Choose a time' : !topic ? 'Choose a topic' : currentUser() ? 'Review booking' : 'Log in to book'}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
};

export default MentorDetailPage;
