import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { getMyCertificates, formatIssuedDate } from '../services/learningApi';
import './CertificatesPage.css';

const pad = (n) => String(n).padStart(2, '0');

const CertificatesPage = () => {
  const [state, setState] = useState({ loading: true, error: false, certificates: [], inProgress: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const res = await getMyCertificates();
      const { certificates = [], inProgress = [] } = res.data.data || {};
      setState({ loading: false, error: false, certificates, inProgress });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { loading, error, certificates, inProgress } = state;

  return (
    <AppShell nav={learnerNav('certificates')} eyebrow="Achievements" title={<>Your <em>certificates</em></>}>
      <div className="certs">
        {loading ? (
          <div className="edu-loading">
            <div className="edu-spinner" role="status" aria-label="Loading certificates" />
            <p className="edu-label">Gathering your certificates</p>
          </div>
        ) : error ? (
          <div className="edu-empty">
            <h2 className="edu-h3">Couldn’t load your <em>certificates</em></h2>
            <p className="edu-muted">Something went wrong on our side. Please try again.</p>
            <button className="edu-btn" onClick={load}>Try again</button>
          </div>
        ) : (
          <>
            <section className="edu-stats certs-stats" aria-label="Summary">
              <div className="edu-stat">
                <p className="edu-label">Earned</p>
                <p className="edu-stat__value">{pad(certificates.length)}</p>
                <p className="edu-stat__note">Verified certificates</p>
              </div>
              <div className="edu-stat">
                <p className="edu-label">In progress</p>
                <p className="edu-stat__value">{pad(inProgress.length)}</p>
                <p className="edu-stat__note">Finish every lesson to unlock</p>
              </div>
              <div className="edu-stat">
                <p className="edu-label">Closest</p>
                <p className="edu-stat__value">
                  {inProgress.length ? <>{inProgress[0].completionPercentage}<small>%</small></> : '—'}
                </p>
                <p className="edu-stat__note certs-stats__clip">{inProgress[0]?.title || 'Nothing in progress'}</p>
              </div>
            </section>

            <section className="certs-section" aria-labelledby="certs-earned">
              <header className="certs-section__head">
                <p className="edu-label edu-label--accent">01 · Earned</p>
                <h2 id="certs-earned" className="certs-section__title">Ready to <em>share</em></h2>
              </header>

              {certificates.length === 0 ? (
                <div className="edu-empty certs-empty">
                  <h3 className="edu-h3">No certificates <em>yet</em></h3>
                  <p className="edu-muted">Complete every lesson in a program and your certificate appears here instantly.</p>
                  <Link to={inProgress[0] ? `/lms/${inProgress[0].courseId}` : '/courses'} className="edu-btn edu-btn--accent">
                    {inProgress[0] ? 'Continue learning' : 'Browse programs'} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                <ul className="certs-grid">
                  {certificates.map((c) => (
                    <li key={c.certificateId}>
                      <Link to={`/certificates/${c.courseId}`} className="certs-card edu-pop">
                        <span className="certs-card__seal" aria-hidden="true">
                          <i className="bi bi-patch-check-fill" />
                        </span>
                        <span className="edu-label">{c.category || 'Certificate'} · {formatIssuedDate(c.issuedAt)}</span>
                        <span className="certs-card__title">{c.courseTitle}</span>
                        <span className="certs-card__meta">
                          <span>{c.instructor}</span>
                          <span className="certs-card__id">{c.certificateId}</span>
                        </span>
                        <span className="certs-card__go">
                          View certificate <span aria-hidden="true">→</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {inProgress.length > 0 && (
              <section className="certs-section" aria-labelledby="certs-progress">
                <header className="certs-section__head">
                  <p className="edu-label edu-label--accent">02 · In progress</p>
                  <h2 id="certs-progress" className="certs-section__title">Almost <em>there</em></h2>
                </header>
                <ul className="certs-rows">
                  {inProgress.map((c) => (
                    <li key={c.courseId} className="certs-row">
                      <div className="certs-row__main">
                        <span className="edu-label">{c.category}</span>
                        <span className="certs-row__title">{c.title}</span>
                        <div className="certs-row__bar">
                          <div className="edu-progress">
                            <div className="edu-progress__bar edu-progress__bar--accent" style={{ width: `${c.completionPercentage}%` }} />
                          </div>
                          <span className="certs-row__pct">{c.completionPercentage}%</span>
                        </div>
                        <span className="certs-row__note">
                          {c.completedLessons} of {c.totalLessons} lessons · {c.totalLessons - c.completedLessons} to go
                        </span>
                      </div>
                      <Link to={`/lms/${c.courseId}`} className="edu-btn edu-btn--ghost edu-btn--sm certs-row__go">
                        Continue <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
};

export default CertificatesPage;
