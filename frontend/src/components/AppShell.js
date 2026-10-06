import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

/**
 * Layout for signed-in screens (dashboard, classroom, admin).
 *
 * nav: [{ key, label, onClick?, to?, active? }]
 * title / eyebrow: page heading shown in the top bar
 * actions: node rendered on the right of the top bar
 * sidebarExtra: node rendered under the nav (e.g. course outline)
 */
const AppShell = ({ nav = [], title, eyebrow, actions, sidebarExtra, children }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/auth');
  };

  const initials = (user?.name || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`app-shell${open ? ' is-open' : ''}`}>
      <aside className="app-shell__side">
        <div className="app-shell__brand">
          <Link to="/"><Logo /></Link>
        </div>

        <nav className="app-shell__nav">
          {nav.map((item, i) => {
            const content = (
              <>
                <span className="app-shell__num">{String(i + 1).padStart(2, '0')}</span>
                <span>{item.label}</span>
              </>
            );
            const cls = `app-shell__link${item.active ? ' is-active' : ''}`;
            return item.to ? (
              <Link key={item.key} to={item.to} className={cls} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={item.key}
                className={cls}
                onClick={() => { setOpen(false); item.onClick && item.onClick(); }}
              >
                {content}
              </button>
            );
          })}
        </nav>

        {sidebarExtra && <div className="app-shell__extra">{sidebarExtra}</div>}

        {user && (
          <div className="app-shell__user">
            <span className="app-shell__avatar">{initials}</span>
            <div className="app-shell__who">
              <strong>{user.name}</strong>
              <span>{user.role === 'admin' ? 'Admin' : 'Learner'}</span>
            </div>
            <button className="app-shell__logout" onClick={logout} title="Log out">
              Log out
            </button>
          </div>
        )}
      </aside>

      <div className="app-shell__scrim" onClick={() => setOpen(false)} />

      <div className="app-shell__main">
        <header className="app-shell__top">
          <button className="app-shell__menu" onClick={() => setOpen(true)} aria-label="Open menu">
            Menu
          </button>
          <div className="app-shell__title">
            {eyebrow && <p className="edu-label">{eyebrow}</p>}
            {title && <h1 className="edu-h3">{title}</h1>}
          </div>
          <div className="app-shell__actions">
            {actions}
            <ThemeToggle />
          </div>
        </header>
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
