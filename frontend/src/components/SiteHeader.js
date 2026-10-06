import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const SiteHeader = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const goToSection = (id) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/', { state: { scrollTo: id } });
    }
  };

  return (
    <header className="site-header">
      <div className="edu-container site-header__inner">
        <Link to="/" className="site-header__brand" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <div className="site-header__tools">
          <ThemeToggle />
          <button
            className="site-header__toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>

        <nav className={`site-header__nav${open ? ' is-open' : ''}`}>
          <Link to="/courses" onClick={() => setOpen(false)}>Programs</Link>
          <Link to="/mentors" onClick={() => setOpen(false)}>Mentors</Link>
          <Link to="/events" onClick={() => setOpen(false)}>Live events</Link>
          <button onClick={() => goToSection('method')}>Method</button>
          <button onClick={() => goToSection('faq')}>Questions</button>
          <span className="site-header__divider" />
          {user ? (
            <Link
              to={user.role === 'admin' ? '/admin-upload' : '/dashboard'}
              className="edu-btn edu-btn--sm"
              onClick={() => setOpen(false)}
            >
              My desk →
            </Link>
          ) : (
            <>
              <Link to="/auth" onClick={() => setOpen(false)}>Log in</Link>
              <Link to="/courses" className="edu-btn edu-btn--sm" onClick={() => setOpen(false)}>
                Start learning →
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;
