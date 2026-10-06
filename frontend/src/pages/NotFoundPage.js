import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';

const NotFoundPage = () => {
  const { pathname } = useLocation();
  return (
    <div className="landing">
      <SiteHeader />
      <section className="edu-section">
        <div className="edu-container" style={{ maxWidth: 760 }}>
          <p className="edu-index"><span>404</span><span>Page not found</span></p>
          <h1 className="edu-display" style={{ margin: '28px 0 20px' }}>
            Wrong <em>turn.</em>
          </h1>
          <p className="edu-lead">
            We couldn’t find <code>{pathname}</code>. It may have moved, or the link might be mistyped.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 36 }}>
            <Link to="/" className="edu-btn edu-btn--accent edu-btn--lg">Back to home</Link>
            <Link to="/courses" className="edu-btn edu-btn--ghost edu-btn--lg">Browse programs</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
};

export default NotFoundPage;
