import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../components/AppShell';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { learnerNav } from '../components/learnerNav';
import { toast } from '../components/Toaster';
import { BRAND } from '../brand';
import { createSupportTicket, getMyTickets, getTicket, replyToTicket } from '../services/accountApi';
import './SupportPage.css';

const TOPICS = [
  { key: 'account', label: 'Account & login' },
  { key: 'payment', label: 'Payments & refunds' },
  { key: 'course', label: 'Course content' },
  { key: 'technical', label: 'Technical problem' },
  { key: 'other', label: 'Something else' }
];
const topicLabel = (k) => TOPICS.find((t) => t.key === k)?.label || 'Other';

const STATUS = {
  open: { label: 'Open', cls: 'edu-tag--ochre' },
  in_progress: { label: 'In progress', cls: 'edu-tag--accent' },
  resolved: { label: 'Resolved', cls: 'edu-tag--forest' }
};

const FAQS = [
  {
    tag: 'Enrolling',
    q: 'How do I enrol in a program?',
    a: 'Open any program from Programs, check the syllabus and press Enrol. Pick a start and end date for your study plan, pay securely, and the program appears on your dashboard straight away.'
  },
  {
    tag: 'Payments',
    q: 'Which payment methods do you accept?',
    a: 'UPI, all major debit and credit cards, net banking and popular wallets, processed by our payment partner. Every purchase gets a GST invoice that you can download from Orders.'
  },
  {
    tag: 'Refunds',
    q: 'Can I get a refund?',
    a: 'Yes. If you change your mind within 7 days of purchase and have finished less than 20% of the program, we refund the full amount to the original payment method. Raise a request below with your order ID and choose “Payments & refunds”. Refunds usually reach you in 5–7 working days.'
  },
  {
    tag: 'Coupons',
    q: 'My coupon code isn’t working. What should I check?',
    a: 'Codes are case-insensitive but must be typed without spaces. Each code has an expiry date, a minimum order value and sometimes a limit of one use per learner. If a valid code still fails, send us the code and the program name.'
  },
  {
    tag: 'Certificates',
    q: 'When do I get my certificate?',
    a: 'As soon as you complete every lesson and pass the final quiz, your certificate unlocks under Certificates. Each one has a unique verification ID you can add to LinkedIn or your CV.'
  },
  {
    tag: 'Quizzes',
    q: 'How do quizzes work? Can I retake them?',
    a: 'Each program ends with a short quiz. You need 70% to pass, and you can retake it as many times as you like — we keep your best score.'
  },
  {
    tag: 'Study plans',
    q: 'Can I change my study plan dates?',
    a: 'Yes. On your dashboard, press the plan chip under any program and pick new start and end dates. Your progress stays exactly as it is — only the suggested daily pace changes.'
  },
  {
    tag: 'Account',
    q: 'I forgot my password. How do I get back in?',
    a: 'Send us a request with the topic “Account & login” from the email address you signed up with and we’ll help you reset it. If you are already signed in, you can change your password any time from Profile.'
  },
  {
    tag: 'Mentors',
    q: 'How do 1:1 mentor sessions work?',
    a: 'Browse Mentors, pick someone whose experience fits your goals and book an open slot. You’ll find the session and its joining link under My bookings. You can cancel up to 12 hours before the start.'
  },
  {
    tag: 'Access',
    q: 'How long do I keep access to a program?',
    a: 'For as long as the program is offered — including future updates to its lessons. Your progress and certificates stay with your account.'
  }
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MSG_MAX = 2000;

const fmtDate = (d, withTime) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
};

const getSession = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return localStorage.getItem('token') && user ? user : null;
  } catch (e) {
    return null;
  }
};

const initialForm = (state) => {
  const topic = TOPICS.some((t) => t.key === state?.topic) ? state.topic : '';
  const subject = state?.subject || (topic === 'account' ? 'Can’t log in to my account' : '');
  return { topic, subject, message: '', orderId: state?.orderId || '', name: '', email: '' };
};

const validate = (f, guest) => {
  const e = {};
  if (!f.topic) e.topic = 'Choose a topic.';
  if (guest) {
    if (f.name.trim().length < 2) e.name = 'Tell us your name.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email so we can reply.';
  }
  const s = f.subject.trim().length;
  if (s < 5 || s > 120) e.subject = 'Subject must be 5–120 characters.';
  const m = f.message.trim().length;
  if (m < 20) e.message = `Please add a little more detail (at least 20 characters).`;
  if (m > MSG_MAX) e.message = `Keep it under ${MSG_MAX} characters.`;
  return e;
};

/* ---------- Ticket conversation modal ---------- */
const TicketModal = ({ ticketId, onClose, onUpdated }) => {
  const [ticket, setTicket] = useState(null);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getTicket(ticketId)
      .then((res) => { if (alive) setTicket(res.data.data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [ticketId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'nearest' });
  }, [ticket]);

  const send = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (text.length < 2 || sending) return;
    setSending(true);
    try {
      const res = await replyToTicket(ticketId, text);
      setTicket(res.data.data);
      setReply('');
      onUpdated(res.data.data);
      toast.success('Reply sent');
    } catch (err) {
      // toast comes from the API client
    } finally {
      setSending(false);
    }
  };

  const status = STATUS[ticket?.status] || STATUS.open;

  return (
    <div className="edu-modal-overlay" onClick={onClose}>
      <div
        className="edu-modal sup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sup-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edu-modal__head">
          <div className="sup-modal__titles">
            <p className="edu-label">{ticket ? `${ticket.number} · ${topicLabel(ticket.topic)}` : 'Ticket'}</p>
            <h2 id="sup-modal-title" className="edu-h3">{ticket ? ticket.subject : 'Loading…'}</h2>
          </div>
          <button className="edu-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="edu-modal__body sup-modal__body">
          {failed ? (
            <p className="edu-muted">We couldn’t open this ticket. Please close and try again.</p>
          ) : !ticket ? (
            <div className="sup-modal__loading"><span className="edu-spinner" /></div>
          ) : (
            <>
              <div className="sup-modal__meta">
                <span className={`edu-tag ${status.cls}`}>{status.label}</span>
                <span>Opened {fmtDate(ticket.createdAt)}</span>
                {ticket.orderId && <span>Order {ticket.orderId}</span>}
              </div>
              <ol className="sup-thread">
                {ticket.messages.map((m) => (
                  <li key={m.id} className={`sup-msg${m.from === 'support' ? ' is-support' : ''}`}>
                    <div className="sup-msg__head">
                      <strong>{m.from === 'support' ? `${BRAND.name} support` : 'You'}</strong>
                      <span>{fmtDate(m.createdAt, true)}</span>
                    </div>
                    <p>{m.body}</p>
                  </li>
                ))}
                <li ref={endRef} className="sup-thread__end" aria-hidden="true" />
              </ol>
              {ticket.status !== 'resolved' && ticket.messages.every((m) => m.from !== 'support') && (
                <p className="sup-modal__note">
                  <i className="bi bi-clock" aria-hidden="true" /> Our team usually replies within one working day.
                </p>
              )}
            </>
          )}
        </div>

        {ticket && (
          <form className="edu-modal__foot sup-reply" onSubmit={send}>
            <label htmlFor="sup-reply" className="sup-sr">Your reply</label>
            <textarea
              id="sup-reply"
              className="edu-textarea"
              rows={2}
              maxLength={MSG_MAX}
              placeholder={ticket.status === 'resolved' ? 'Still need help? Replying reopens this ticket.' : 'Write a reply…'}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <button type="submit" className="edu-btn edu-btn--accent" disabled={reply.trim().length < 2 || sending}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

/* ---------- Page ---------- */
const SupportPage = () => {
  const location = useLocation();
  const user = getSession();
  const guest = !user;

  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState(null);

  const [form, setForm] = useState(() => initialForm(location.state));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState(null);

  const [tickets, setTickets] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const formRef = useRef(null);

  const loadTickets = useCallback(async () => {
    try {
      const res = await getMyTickets();
      setTickets(res.data.data || []);
    } catch (err) {
      setTickets([]);
    }
  }, []);

  useEffect(() => {
    if (!guest) loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving with a topic (e.g. "Forgot password?") — jump straight to the form
  useEffect(() => {
    if (location.state?.topic && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.state]);

  const faqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    const words = q.split(/\s+/);
    return FAQS.filter((f) => {
      const hay = `${f.tag} ${f.q} ${f.a}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query]);

  const setField = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const found = validate(form, guest);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSending(true);
    try {
      const payload = {
        topic: form.topic,
        subject: form.subject.trim(),
        message: form.message.trim(),
        orderId: form.orderId.trim() || undefined
      };
      if (guest) {
        payload.name = form.name.trim();
        payload.email = form.email.trim();
      }
      const res = await createSupportTicket(payload);
      const ticket = res.data.data;
      setCreated(ticket);
      toast.success(`Ticket ${ticket.number} created`);
      if (!guest) {
        setTickets((list) => [ticket, ...(list || [])]);
      }
      if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'We couldn’t send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    setCreated(null);
    setForm(initialForm(null));
    setErrors({});
  };

  const onTicketUpdated = (t) => {
    setTickets((list) => (list || []).map((x) => (x.id === t.id ? { ...x, ...t } : x)));
  };

  const closeModal = useCallback(() => setActiveTicket(null), []);

  const msgLen = form.message.length;

  const content = (
    <div className="sup">
      {/* Hero + search */}
      <section className="sup-hero">
        <p className="edu-label edu-label--accent">Help centre</p>
        <h1 className="edu-h1 sup-hero__title">How can we <em>help?</em></h1>
        <div className="sup-search">
          <i className="bi bi-search" aria-hidden="true" />
          <label htmlFor="sup-q" className="sup-sr">Search help articles</label>
          <input
            id="sup-q"
            type="search"
            className="edu-input"
            placeholder="Search refunds, certificates, coupons…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenFaq(null); }}
            autoComplete="off"
          />
        </div>
        <div className="sup-chips" aria-label="Popular topics">
          {['Refund', 'Coupon', 'Certificate', 'Password', 'Study plan'].map((c) => (
            <button key={c} type="button" className="sup-chip" onClick={() => { setQuery(c.toLowerCase()); setOpenFaq(null); }}>
              {c}
            </button>
          ))}
        </div>
      </section>

      <div className="sup-grid">
        {/* FAQ */}
        <section className="sup-faq" aria-labelledby="sup-faq-title">
          <div className="sup-sechead">
            <h2 id="sup-faq-title" className="edu-h3">Common questions</h2>
            <span className="edu-label">{faqs.length} {faqs.length === 1 ? 'answer' : 'answers'}</span>
          </div>
          {faqs.length === 0 ? (
            <div className="sup-noresult">
              <p className="edu-h4">No answers match “{query}”.</p>
              <p className="edu-muted">Try a different word, or send us a message — a real person reads every one.</p>
              <button type="button" className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            <ul className="sup-acc">
              {faqs.map((f) => {
                const idx = FAQS.indexOf(f);
                const open = openFaq === idx;
                return (
                  <li key={f.q} className={`sup-acc__item${open ? ' is-open' : ''}`}>
                    <h3 className="sup-acc__h">
                      <button
                        type="button"
                        className="sup-acc__q"
                        aria-expanded={open}
                        aria-controls={`faq-${idx}`}
                        id={`faq-q-${idx}`}
                        onClick={() => setOpenFaq(open ? null : idx)}
                      >
                        <span className="sup-acc__tag">{f.tag}</span>
                        <span className="sup-acc__text">{f.q}</span>
                        <span className="sup-acc__icon" aria-hidden="true">{open ? '−' : '+'}</span>
                      </button>
                    </h3>
                    <div id={`faq-${idx}`} role="region" aria-labelledby={`faq-q-${idx}`} className="sup-acc__a" hidden={!open}>
                      <p>{f.a}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Contact */}
        <section className="sup-contact" ref={formRef} aria-labelledby="sup-contact-title">
          <div className="edu-panel">
            <div className="edu-panel__head">
              <div>
                <p className="edu-label">Still stuck?</p>
                <h2 id="sup-contact-title" className="edu-h3">Contact us</h2>
              </div>
            </div>

            {created ? (
              <div className="edu-panel__body sup-done" role="status">
                <span className="sup-done__icon" aria-hidden="true"><i className="bi bi-check-lg" /></span>
                <p className="edu-label">Ticket created</p>
                <p className="sup-done__num">{created.number}</p>
                <p className="sup-done__text">
                  Thanks{guest ? `, ${created.name.split(' ')[0]}` : ''}. We’ve got your message about “{created.subject}”
                  and will reply to <strong>{created.email}</strong> within one working day.
                </p>
                <div className="sup-done__actions">
                  {!guest && (
                    <button type="button" className="edu-btn edu-btn--accent" onClick={() => setActiveTicket(created.id)}>
                      View ticket
                    </button>
                  )}
                  <button type="button" className="edu-btn edu-btn--ghost" onClick={startOver}>
                    Send another
                  </button>
                </div>
              </div>
            ) : (
              <form className="edu-panel__body sup-form" onSubmit={submit} noValidate>
                {guest && (
                  <div className="sup-form__row">
                    <div className="edu-field">
                      <label htmlFor="sup-name">Your name</label>
                      <input id="sup-name" className="edu-input" value={form.name} onChange={setField('name')}
                        autoComplete="name" maxLength={80} aria-invalid={!!errors.name} />
                      {errors.name && <span className="sup-err">{errors.name}</span>}
                    </div>
                    <div className="edu-field">
                      <label htmlFor="sup-email">Email</label>
                      <input id="sup-email" type="email" className="edu-input" value={form.email} onChange={setField('email')}
                        autoComplete="email" inputMode="email" aria-invalid={!!errors.email} />
                      {errors.email && <span className="sup-err">{errors.email}</span>}
                    </div>
                  </div>
                )}

                <div className="sup-form__row">
                  <div className="edu-field">
                    <label htmlFor="sup-topic">Topic</label>
                    <select id="sup-topic" className="edu-select" value={form.topic} onChange={setField('topic')} aria-invalid={!!errors.topic}>
                      <option value="" disabled>Choose a topic</option>
                      {TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    {errors.topic && <span className="sup-err">{errors.topic}</span>}
                  </div>
                  <div className="edu-field">
                    <label htmlFor="sup-order">Order ID <span className="sup-opt">optional</span></label>
                    <input id="sup-order" className="edu-input" value={form.orderId} onChange={setField('orderId')}
                      maxLength={64} placeholder="e.g. order_Q2x8…" />
                  </div>
                </div>

                <div className="edu-field">
                  <label htmlFor="sup-subject">Subject</label>
                  <input id="sup-subject" className="edu-input" value={form.subject} onChange={setField('subject')}
                    maxLength={120} placeholder="A short summary" aria-invalid={!!errors.subject} />
                  {errors.subject && <span className="sup-err">{errors.subject}</span>}
                </div>

                <div className="edu-field">
                  <label htmlFor="sup-msg">Message</label>
                  <textarea id="sup-msg" className="edu-textarea" rows={6} value={form.message} onChange={setField('message')}
                    maxLength={MSG_MAX} placeholder="What happened, what you expected, and anything you’ve already tried."
                    aria-invalid={!!errors.message} />
                  <span className={`sup-count${msgLen > MSG_MAX - 100 ? ' is-near' : ''}${msgLen > 0 && form.message.trim().length < 20 ? ' is-short' : ''}`}>
                    {msgLen}/{MSG_MAX}
                  </span>
                  {errors.message && <span className="sup-err">{errors.message}</span>}
                </div>

                {submitError && <div className="edu-alert edu-alert--error sup-alert" role="alert">{submitError}</div>}

                <div className="sup-form__foot">
                  <p className="sup-form__note">
                    {guest
                      ? <>Have an account? <Link to="/auth" state={{ from: '/support' }}>Log in</Link> to track your tickets.</>
                      : <>We’ll reply to <strong>{user.email}</strong>.</>}
                  </p>
                  <button type="submit" className="edu-btn edu-btn--accent" disabled={sending}>
                    {sending ? 'Sending…' : 'Send message'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>

      {/* Your tickets */}
      {!guest && (
        <section className="sup-tickets" aria-labelledby="sup-tickets-title">
          <div className="sup-sechead">
            <h2 id="sup-tickets-title" className="edu-h3">Your tickets</h2>
            {tickets && tickets.length > 0 && <span className="edu-label">{tickets.length} total</span>}
          </div>
          {tickets === null ? (
            <div className="sup-tickets__loading"><span className="edu-spinner" /></div>
          ) : tickets.length === 0 ? (
            <div className="sup-noresult">
              <p className="edu-h4">No tickets yet.</p>
              <p className="edu-muted">When you contact us, your conversations show up here.</p>
            </div>
          ) : (
            <ul className="sup-tlist">
              {tickets.map((t) => {
                const st = STATUS[t.status] || STATUS.open;
                return (
                  <li key={t.id}>
                    <button type="button" className="sup-ticket" onClick={() => setActiveTicket(t.id)}>
                      <span className="sup-ticket__num">{t.number}</span>
                      <span className="sup-ticket__main">
                        <strong>{t.subject}</strong>
                        <span>{topicLabel(t.topic)} · {fmtDate(t.createdAt)}{t.messageCount > 1 ? ` · ${t.messageCount} messages` : ''}</span>
                      </span>
                      <span className={`edu-tag ${st.cls}`}>{st.label}</span>
                      <i className="bi bi-chevron-right sup-ticket__go" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {activeTicket && (
        <TicketModal ticketId={activeTicket} onClose={closeModal} onUpdated={onTicketUpdated} />
      )}
    </div>
  );

  if (guest) {
    return (
      <div className="sup-page">
        <SiteHeader />
        <main className="edu-container sup-page__main">{content}</main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <AppShell nav={learnerNav('support')} eyebrow="Help centre" title="Support">
      {content}
    </AppShell>
  );
};

export default SupportPage;
