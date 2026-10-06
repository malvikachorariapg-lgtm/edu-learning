import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { login, register } from '../services/api';
import { toast } from '../components/Toaster';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';
import { BRAND } from '../brand';
import './AuthPage.css';

// After this many failed logins in a row on this device, the form cools down
const MAX_FAILS = 5;
const COOLDOWN_SECONDS = 30;

const passwordChecks = (pw) => ({
  length: pw.length >= 8,
  letter: /[A-Za-z]/.test(pw),
  number: /\d/.test(pw),
  extra: pw.length >= 12 || /[^A-Za-z0-9]/.test(pw)
});
const STRENGTH_LABELS = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'];

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fails, setFails] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const checks = passwordChecks(formData.password);
  const score = Object.values(checks).filter(Boolean).length;
  const passwordOk = checks.length && checks.letter && checks.number;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const switchMode = (toLogin) => {
    if (toLogin === isLogin) return;
    setIsLogin(toLogin);
    setError('');
    setFormData((f) => ({ name: '', email: f.email, password: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      if (formData.name.trim().length < 2) {
        setError('Tell us your name (at least 2 characters).');
        return;
      }
      if (!passwordOk) {
        setError('Use at least 8 characters with both letters and numbers.');
        return;
      }
    }

    setLoading(true);
    try {
      const response = isLogin
        ? await login({ email: formData.email, password: formData.password })
        : await register({ name: formData.name.trim(), email: formData.email, password: formData.password });

      const { user, token } = response.data;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      setFails(0);
      toast.success(isLogin ? `Welcome back, ${user.name.split(' ')[0]}.` : 'Account created. Welcome aboard!');

      if (user.role === 'admin') {
        navigate('/admin-upload');
      } else {
        navigate(location.state?.from || '/dashboard');
      }
    } catch (err) {
      const status = err.response?.status;
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      if (isLogin && status === 401) {
        const n = fails + 1;
        setFails(n);
        if (n >= MAX_FAILS) {
          setCooldown(COOLDOWN_SECONDS);
          setFails(0);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const goingToPayment = location.state?.from?.startsWith('/payment');
  const locked = loading || cooldown > 0;

  return (
    <div className="auth-page">
      <header className="auth-top">
        <Link to="/" className="auth-top__brand" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <div className="auth-top__tools">
          <ThemeToggle />
          <Link to="/" className="auth-top__back">← Home</Link>
        </div>
      </header>

      <main className="auth-grid">
        <section className="auth-statement">
          <p className="edu-label edu-label--accent">Members area</p>
          <h1 className="edu-display auth-statement__title">
            The work<br />is waiting.<br /><em>So is your mentor.</em>
          </h1>

          <ol className="auth-facts">
            <li>
              <span className="auth-facts__num">01</span>
              <span>One account for your lessons, progress, quizzes and certificates.</span>
            </li>
            <li>
              <span className="auth-facts__num">02</span>
              <span>Pick up where you left off, on any device.</span>
            </li>
            <li>
              <span className="auth-facts__num">03</span>
              <span>No newsletters you didn't ask for.</span>
            </li>
          </ol>
        </section>

        <div className="auth-form-col">
          <div className="edu-pop auth-card">
            <div className="auth-tabs" role="tablist" aria-label="Account">
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                className={`auth-tab${isLogin ? ' is-active' : ''}`}
                onClick={() => switchMode(true)}
              >
                <span className="auth-tab__num">A</span> Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                className={`auth-tab${!isLogin ? ' is-active' : ''}`}
                onClick={() => switchMode(false)}
              >
                <span className="auth-tab__num">B</span> Create account
              </button>
            </div>

            <header className="auth-form-head">
              <h2 className="edu-h2 auth-form-head__title">
                {isLogin ? <>Welcome <em>back.</em></> : <>Get <em>enrolled.</em></>}
              </h2>
              <p className="auth-form-head__sub">
                {goingToPayment
                  ? 'Sign in first — we\'ll take you straight to checkout after.'
                  : isLogin
                    ? 'Use the email you signed up with.'
                    : 'Takes about thirty seconds. No card needed.'}
              </p>
            </header>

            {error && (
              <div className="edu-alert edu-alert--error auth-alert" role="alert">
                <strong>Hmm.</strong>
                <span>{error}</span>
              </div>
            )}
            {cooldown > 0 && (
              <div className="edu-alert auth-alert" role="status">
                <span>Too many failed attempts. Try again in {cooldown}s — or contact support.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <div className="edu-field">
                  <label htmlFor="name">Full name</label>
                  <input
                    type="text"
                    className="edu-input"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Asha Menon"
                  />
                </div>
              )}

              <div className="edu-field">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  className="edu-input"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>

              <div className="edu-field">
                <div className="auth-field-row">
                  <label htmlFor="password">Password</label>
                  {isLogin ? (
                    <Link to="/support" state={{ topic: 'account' }} className="auth-forgot">
                      Forgot password?
                    </Link>
                  ) : (
                    <span className="auth-hint">8+ chars, letters & numbers</span>
                  )}
                </div>
                <div className="auth-password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="edu-input"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    minLength={isLogin ? undefined : 8}
                  />
                  <button
                    type="button"
                    className="auth-password__toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                {!isLogin && formData.password && (
                  <div className={`auth-strength auth-strength--${score}`} aria-live="polite">
                    <div className="auth-strength__bars" aria-hidden="true">
                      {[1, 2, 3, 4].map((i) => <span key={i} className={i <= score ? 'is-on' : ''} />)}
                    </div>
                    <span className="auth-strength__label">{STRENGTH_LABELS[score]}</span>
                    <ul className="auth-strength__rules">
                      <li className={checks.length ? 'is-ok' : ''}>8+ characters</li>
                      <li className={checks.letter ? 'is-ok' : ''}>A letter</li>
                      <li className={checks.number ? 'is-ok' : ''}>A number</li>
                    </ul>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block auth-submit"
                disabled={locked || (!isLogin && Boolean(formData.password) && !passwordOk)}
              >
                {loading ? (
                  <>
                    <span className="auth-dot" aria-hidden="true" />
                    {isLogin ? 'Logging in…' : 'Creating account…'}
                  </>
                ) : (
                  <>{isLogin ? 'Log in' : 'Create account'} <span aria-hidden="true">→</span></>
                )}
              </button>
            </form>

            <p className="auth-switch">
              {isLogin ? 'New here? ' : 'Already have an account? '}
              <button type="button" className="edu-link" onClick={() => switchMode(!isLogin)}>
                {isLogin ? 'Create an account' : 'Log in instead'}
              </button>
            </p>
          </div>

        </div>
      </main>
    </div>
  );
};

export default AuthPage;
