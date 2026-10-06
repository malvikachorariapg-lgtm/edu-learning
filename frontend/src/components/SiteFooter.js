import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import { BRAND, CATEGORIES } from '../brand';
import { subscribeNewsletter } from '../services/api';
import { toast } from './Toaster';

const SiteFooter = () => {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const res = await subscribeNewsletter(email.trim());
      toast.success(res.data?.message || 'Subscribed!');
      setEmail('');
    } catch (err) {
      // the API interceptor already shows the error toast
    } finally {
      setSending(false);
    }
  };

  return (
    <footer className="site-footer">
      <div className="edu-container">
        <div className="site-footer__top">
          <p className="site-footer__statement">
            Small cohorts. Real mentors.<br /><em>Work you can show.</em>
          </p>
          <Link to="/courses" className="edu-btn edu-btn--accent">See all programs →</Link>
        </div>

        <form className="site-footer__news" onSubmit={subscribe}>
          <div>
            <p className="edu-label">The Sunday letter</p>
            <p className="site-footer__news-copy">One useful idea a week from our mentors. No spam, unsubscribe anytime.</p>
          </div>
          <div className="site-footer__news-row">
            <input
              type="email"
              className="edu-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email for newsletter"
              required
            />
            <button type="submit" className="edu-btn" disabled={sending}>
              {sending ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
        </form>

        <div className="site-footer__grid">
          <div>
            <Logo inverted />
            <p className="site-footer__about">{BRAND.description}</p>
          </div>
          <div>
            <h6 className="edu-label">Programs</h6>
            <ul>
              {CATEGORIES.map((c) => (
                <li key={c.key}>
                  <Link to="/courses" state={{ interest: c.key }}>{c.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h6 className="edu-label">Learn with us</h6>
            <ul>
              <li><Link to="/mentors">Mentors</Link></li>
              <li><Link to="/events">Live events</Link></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><Link to="/certificates">Certificates</Link></li>
            </ul>
          </div>
          <div>
            <h6 className="edu-label">Help</h6>
            <ul>
              <li><Link to="/suport">Help &amp; support</Link></li>
              <li><Link to="/orders">Orders &amp; invoices</Link></li>
              <li><a href={`mailto:${BRAND.email}`}>{BRAND.email}</a></li>
              <li><a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
            </ul>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {BRAND.year} {BRAND.name}</span>
          <span>Made for people who learn by doing.</span>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
