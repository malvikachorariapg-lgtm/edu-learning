import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { toast } from '../components/Toaster';
import { changeMyPassword, getMyProfile, syncStoredUser, updateMyProfile } from '../services/accountApi';
import './ProfilePage.css';

const PHONE_RE = /^\+?[0-9 ]{10,15}$/;
const BIO_MAX = 280;

const PREFS = [
  { key: 'courseUpdates', title: 'Course updates', note: 'New lessons, schedule changes and replies from mentors.' },
  { key: 'promotions', title: 'Offers & promotions', note: 'Occasional discounts and early access to new programs.' },
  { key: 'weeklyDigest', title: 'Weekly digest', note: 'A Monday summary of your progress and what is next.' }
];

const memberSince = (d) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const draftFrom = (p) => ({ name: p?.name || '', phone: p?.phone || '', bio: p?.bio || '' });

const validateDraft = (d) => {
  const errors = {};
  const name = d.name.trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be between 2 and 80 characters.';
  if (d.phone.trim() && !PHONE_RE.test(d.phone.trim())) errors.phone = 'Enter a valid phone number, e.g. +91 98765 43210.';
  if (d.bio.trim().length > BIO_MAX) errors.bio = `Bio can be at most ${BIO_MAX} characters.`;
  return errors;
};

// 0–4 score used by the strength meter
const passwordScore = (pw) => {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length < 8) score = Math.min(score, 1);
  return score;
};
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

const PasswordInput = ({ id, label, value, onChange, show, autoComplete, describedBy }) => (
  <div className="edu-field">
    <label htmlFor={id}>{label}</label>
    <input
      id={id}
      className="edu-input"
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      aria-describedby={describedBy}
    />
  </div>
);

const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(draftFrom(null));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [prefSaving, setPrefSaving] = useState('');

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const load = async () => {
    setLoadError('');
    try {
      const res = await getMyProfile();
      setProfile(res.data.data);
      setDraft(draftFrom(res.data.data));
    } catch (err) {
      setLoadError(err.response?.data?.message || 'We couldn’t load your profile.');
    }
  };

  useEffect(() => { load(); }, []);

  const startEditing = () => {
    setDraft(draftFrom(profile));
    setErrors({});
    setEditing(true);
  };

  const setField = (key) => (e) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const finishEditing = async (e) => {
    if (e) e.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;

    const payload = { name: draft.name.trim(), phone: draft.phone.trim(), bio: draft.bio.trim() };
    const unchanged = payload.name === profile.name && payload.phone === (profile.phone || '') && payload.bio === (profile.bio || '');
    if (unchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await updateMyProfile(payload);
      const updated = res.data.data;
      setProfile(updated);
      setDraft(draftFrom(updated));
      syncStoredUser({ name: updated.name, phone: updated.phone });
      setEditing(false);
      toast.success('Profile updated');
    } catch (err) {
      // error toast comes from the API client
    } finally {
      setSaving(false);
    }
  };

  const togglePref = async (key) => {
    if (prefSaving) return;
    const prev = profile.notificationPrefs;
    const value = !prev[key];
    setProfile((p) => ({ ...p, notificationPrefs: { ...p.notificationPrefs, [key]: value } }));
    setPrefSaving(key);
    try {
      await updateMyProfile({ notificationPrefs: { [key]: value } });
      const label = PREFS.find((p) => p.key === key)?.title || 'Preference';
      toast.success(`${label} ${value ? 'turned on' : 'turned off'}`);
    } catch (err) {
      setProfile((p) => ({ ...p, notificationPrefs: prev }));
    } finally {
      setPrefSaving('');
    }
  };

  const score = passwordScore(pw.next);
  const pwMismatch = pw.confirm && pw.next !== pw.confirm;

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (!pw.current || !pw.next || !pw.confirm) {
      setPwError('Fill in all three fields.');
      return;
    }
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/\d/.test(pw.next)) {
      setPwError('Your new password needs at least 8 characters, with letters and numbers.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError('The new passwords don’t match.');
      return;
    }
    if (pw.next === pw.current) {
      setPwError('Choose a password that’s different from your current one.');
      return;
    }
    setPwSaving(true);
    try {
      await changeMyPassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setShowPw(false);
      toast.success('Password changed');
    } catch (err) {
      setPwError(err.response?.data?.message || 'Could not change your password. Please try again.');
    } finally {
      setPwSaving(false);
    }
  };

  const initials = useMemo(() => (profile?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(), [profile]);

  const bioLen = draft.bio.length;

  let body;
  if (loadError) {
    body = (
      <div className="edu-empty">
        <h3 className="edu-h3">Profile unavailable</h3>
        <p className="edu-muted">{loadError}</p>
        <button className="edu-btn edu-btn--accent" onClick={load}>Try again</button>
      </div>
    );
  } else if (!profile) {
    body = (
      <div className="edu-loading">
        <div className="edu-spinner" />
        <p className="edu-label">Loading your profile</p>
      </div>
    );
  } else {
    body = (
      <div className="prof">
        <header className="prof-head">
          <p className="edu-label edu-label--accent">Your account</p>
          <h2 className="edu-h1">Profile &amp; <em>settings</em></h2>
        </header>

        <div className="prof-grid">
          <div className="prof-main">
            {/* Personal details */}
            <section className="edu-panel prof-panel" aria-labelledby="prof-details">
              <div className="edu-panel__head">
                <div>
                  <p className="edu-label">01</p>
                  <h3 id="prof-details" className="edu-h3">Personal details</h3>
                </div>
                {!editing && (
                  <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={startEditing}>
                    <i className="bi bi-pencil" aria-hidden="true" /> Edit
                  </button>
                )}
              </div>

              {editing ? (
                <form className="edu-panel__body prof-form" onSubmit={finishEditing} noValidate>
                  <div className="edu-field">
                    <label htmlFor="prof-name">Full name</label>
                    <input
                      id="prof-name"
                      className="edu-input"
                      value={draft.name}
                      onChange={setField('name')}
                      maxLength={80}
                      autoComplete="name"
                      aria-invalid={!!errors.name}
                    />
                    {errors.name && <span className="prof-err">{errors.name}</span>}
                  </div>
                  <div className="edu-field">
                    <label htmlFor="prof-email">Email</label>
                    <input id="prof-email" className="edu-input" value={profile.email} readOnly disabled />
                    <span className="prof-hint">Your email is your login and can’t be changed here.</span>
                  </div>
                  <div className="edu-field">
                    <label htmlFor="prof-phone">Phone <span className="prof-opt">optional</span></label>
                    <input
                      id="prof-phone"
                      className="edu-input"
                      type="tel"
                      inputMode="tel"
                      value={draft.phone}
                      onChange={setField('phone')}
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                      aria-invalid={!!errors.phone}
                    />
                    {errors.phone && <span className="prof-err">{errors.phone}</span>}
                  </div>
                  <div className="edu-field">
                    <label htmlFor="prof-bio">Bio <span className="prof-opt">optional</span></label>
                    <textarea
                      id="prof-bio"
                      className="edu-textarea"
                      value={draft.bio}
                      onChange={setField('bio')}
                      maxLength={BIO_MAX}
                      rows={4}
                      placeholder="A line or two about you and what you’re learning for."
                      aria-invalid={!!errors.bio}
                    />
                    <span className={`prof-count${bioLen >= BIO_MAX - 20 ? ' is-near' : ''}`}>{bioLen}/{BIO_MAX}</span>
                    {errors.bio && <span className="prof-err">{errors.bio}</span>}
                  </div>
                  <div className="prof-actions">
                    <button type="button" className="edu-btn edu-btn--ghost" onClick={finishEditing} disabled={saving}>
                      Cancel
                    </button>
                    <button type="submit" className="edu-btn edu-btn--accent" disabled={saving}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="edu-panel__body prof-facts">
                  <div><dt className="edu-label">Full name</dt><dd>{profile.name}</dd></div>
                  <div><dt className="edu-label">Email</dt><dd className="prof-break">{profile.email}</dd></div>
                  <div><dt className="edu-label">Phone</dt><dd>{profile.phone || <span className="edu-muted">Not added</span>}</dd></div>
                  <div className="prof-facts__wide">
                    <dt className="edu-label">Bio</dt>
                    <dd>{profile.bio || <span className="edu-muted">Tell other learners a little about yourself.</span>}</dd>
                  </div>
                </dl>
              )}
            </section>

            {/* Notifications */}
            <section className="edu-panel prof-panel" aria-labelledby="prof-notify">
              <div className="edu-panel__head">
                <div>
                  <p className="edu-label">02</p>
                  <h3 id="prof-notify" className="edu-h3">Email notifications</h3>
                </div>
              </div>
              <ul className="edu-panel__body prof-prefs">
                {PREFS.map((p) => {
                  const on = !!profile.notificationPrefs?.[p.key];
                  return (
                    <li key={p.key} className="prof-pref">
                      <div className="prof-pref__text">
                        <strong id={`pref-${p.key}`}>{p.title}</strong>
                        <span>{p.note}</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-labelledby={`pref-${p.key}`}
                        className={`prof-switch${on ? ' is-on' : ''}`}
                        onClick={() => togglePref(p.key)}
                        disabled={prefSaving === p.key}
                      >
                        <span className="prof-switch__knob" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Password */}
            <section className="edu-panel prof-panel" aria-labelledby="prof-pass">
              <div className="edu-panel__head">
                <div>
                  <p className="edu-label">03</p>
                  <h3 id="prof-pass" className="edu-h3">Change password</h3>
                </div>
                <button
                  type="button"
                  className="edu-btn edu-btn--ghost edu-btn--sm"
                  onClick={() => setShowPw((s) => !s)}
                  aria-pressed={showPw}
                >
                  <i className={`bi ${showPw ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" /> {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <form className="edu-panel__body prof-form" onSubmit={submitPassword} noValidate>
                <PasswordInput
                  id="pw-current"
                  label="Current password"
                  value={pw.current}
                  onChange={(v) => setPw((x) => ({ ...x, current: v }))}
                  show={showPw}
                  autoComplete="current-password"
                />
                <div className="prof-pw-row">
                  <div>
                    <PasswordInput
                      id="pw-new"
                      label="New password"
                      value={pw.next}
                      onChange={(v) => setPw((x) => ({ ...x, next: v }))}
                      show={showPw}
                      autoComplete="new-password"
                      describedBy="pw-strength"
                    />
                    <div className="prof-meter" id="pw-strength" aria-live="polite">
                      <div className="prof-meter__bars">
                        {[1, 2, 3, 4].map((n) => (
                          <span key={n} className={`prof-meter__bar${score >= n ? ` is-on s-${score}` : ''}`} />
                        ))}
                      </div>
                      <span className="prof-meter__label">
                        {pw.next ? STRENGTH[score] : '8+ characters, letters and numbers'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <PasswordInput
                      id="pw-confirm"
                      label="Confirm new password"
                      value={pw.confirm}
                      onChange={(v) => setPw((x) => ({ ...x, confirm: v }))}
                      show={showPw}
                      autoComplete="new-password"
                    />
                    {pwMismatch && <span className="prof-err">Passwords don’t match yet.</span>}
                  </div>
                </div>
                {pwError && <div className="edu-alert edu-alert--error prof-pw-alert" role="alert">{pwError}</div>}
                <div className="prof-actions">
                  <button type="submit" className="edu-btn edu-btn--accent" disabled={pwSaving}>
                    {pwSaving ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Summary */}
          <aside className="prof-side">
            <div className="edu-pop prof-card">
              <span className="prof-card__avatar" aria-hidden="true">{initials}</span>
              <div className="prof-card__who">
                <strong>{profile.name}</strong>
                <span className="prof-break">{profile.email}</span>
              </div>
              <dl className="prof-card__stats">
                <div>
                  <dt className="edu-label">Member since</dt>
                  <dd>{memberSince(profile.createdAt)}</dd>
                </div>
                <div>
                  <dt className="edu-label">Programs enrolled</dt>
                  <dd>{profile.enrolledCount}</dd>
                </div>
              </dl>
              <div className="prof-card__links">
                <Link to="/orders" className="edu-btn edu-btn--ghost edu-btn--sm edu-btn--block">Order history</Link>
                <Link to="/certificates" className="edu-btn edu-btn--ghost edu-btn--sm edu-btn--block">Certificates</Link>
              </div>
            </div>
            <p className="prof-side__help">
              Need help with your account? <Link to="/support" state={{ topic: 'account', subject: 'Question about my account' }}>Contact support</Link>.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <AppShell nav={learnerNav('profile')} eyebrow="Account" title="Profile">
      {body}
    </AppShell>
  );
};

export default ProfilePage;
