import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { LogoMark } from '../components/Logo';
import { BRAND } from '../brand';
import { getCourseCertificate, formatIssuedDate } from '../services/learningApi';
import './CertificatePage.css';

const formatHours = (h) => {
  if (!h) return null;
  return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
};

// Certificates always print on the light palette, whatever theme is on screen
const usePrintInLight = () => {
  useEffect(() => {
    const root = document.documentElement;
    let previous = null;
    const before = () => {
      previous = root.getAttribute('data-theme');
      root.setAttribute('data-theme', 'light');
    };
    const after = () => {
      if (previous) root.setAttribute('data-theme', previous);
      previous = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
};

const CertificatePage = () => {
  const { courseId } = useParams();
  const [state, setState] = useState({ loading: true, error: null, cert: null });
  usePrintInLight();

  const load = useCallback(async () => {
    setState({ loading: true, error: null, cert: null });
    try {
      const res = await getCourseCertificate(courseId, { silent: true });
      setState({ loading: false, error: null, cert: res.data.data });
    } catch (err) {
      setState({
        loading: false,
        cert: null,
        error: {
          status: err.response?.status,
          message: err.response?.data?.message || 'We couldn’t load this certificate. Check your connection and try again.',
          data: err.response?.data?.data || null
        }
      });
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const { loading, error, cert } = state;

  useEffect(() => {
    if (cert) document.title = `Certificate · ${cert.courseTitle} · ${BRAND.name}`;
    return () => { document.title = BRAND.name; };
  }, [cert]);

  const actions = (
    <>
      <Link to="/certificates" className="edu-btn edu-btn--ghost edu-btn--sm cert-top-btn" aria-label="All certificates">
        <span aria-hidden="true">←</span> <span className="cert-top-btn__text">All</span>
      </Link>
    </>
  );

  return (
    <AppShell
      nav={learnerNav('certificates')}
      eyebrow="Certificate"
      title={cert ? cert.courseTitle : <>Your <em>certificate</em></>}
      actions={actions}
    >
      <div className="cert-page">
        {loading ? (
          <div className="edu-loading">
            <div className="edu-spinner" role="status" aria-label="Loading certificate" />
            <p className="edu-label">Preparing your certificate</p>
          </div>
        ) : error ? (
          <div className="edu-empty cert-empty">
            {error.status === 403 ? (
              <>
                <p className="edu-label edu-label--accent">Not unlocked yet</p>
                <h2 className="edu-h3">Finish the program to <em>earn it</em></h2>
                <p className="edu-muted">{error.message}</p>
                {error.data && (
                  <div className="cert-empty__bar">
                    <div className="edu-progress">
                      <div className="edu-progress__bar edu-progress__bar--accent" style={{ width: `${error.data.completionPercentage}%` }} />
                    </div>
                    <span className="edu-label">{error.data.completionPercentage}% complete</span>
                  </div>
                )}
                <Link to={`/lms/${courseId}`} className="edu-btn edu-btn--accent">Continue learning <span aria-hidden="true">→</span></Link>
              </>
            ) : (
              <>
                <h2 className="edu-h3">Certificate <em>unavailable</em></h2>
                <p className="edu-muted">{error.message}</p>
                <div className="cert-empty__actions">
                  {error.status !== 404 && error.status !== 400 && <button className="edu-btn" onClick={load}>Try again</button>}
                  <Link to="/certificates" className="edu-btn edu-btn--ghost">All certificates</Link>
                </div>
              </>
            )}
          </div>
        ) : cert ? (
          <>
            <div className="cert-toolbar">
              <p className="cert-toolbar__note">
                <i className="bi bi-patch-check-fill" aria-hidden="true" /> Issued {formatIssuedDate(cert.issuedAt)} · ID {cert.certificateId}
              </p>
              <div className="cert-toolbar__actions">
                <Link to={`/lms/${cert.courseId}`} className="edu-btn edu-btn--ghost edu-btn--sm">Classroom</Link>
                <button className="edu-btn edu-btn--accent edu-btn--sm" onClick={() => window.print()}>
                  <i className="bi bi-printer" aria-hidden="true" /> Print / Save as PDF
                </button>
              </div>
            </div>

            <div className="cert-stage">
              <article className="cert" aria-label={`Certificate of completion for ${cert.courseTitle}`}>
                <div className="cert__frame">
                  <header className="cert__head">
                    <span className="cert__brand">
                      <LogoMark size={30} />
                      <span><em>Edu</em> Learning</span>
                    </span>
                    <span className="cert__kicker">Certificate № {cert.certificateId}</span>
                  </header>

                  <div className="cert__body">
                    <p className="cert__eyebrow">Certificate of completion</p>
                    <p className="cert__intro">This is to certify that</p>
                    <p className="cert__name">{cert.learnerName}</p>
                    <p className="cert__intro">has successfully completed every lesson of</p>
                    <h2 className="cert__course">{cert.courseTitle}</h2>
                    <p className="cert__detail">
                      {[cert.category && `${cert.category} program`, cert.courseDuration, formatHours(cert.durationHours) && `${formatHours(cert.durationHours)} of video lessons`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <footer className="cert__foot">
                    <div className="cert__sign">
                      <span className="cert__signature">{cert.instructor}</span>
                      <span className="cert__rule" />
                      <span className="cert__role">Lead mentor</span>
                    </div>
                    <div className="cert__seal" aria-hidden="true">
                      <span className="cert__seal-inner">
                        <i className="bi bi-patch-check-fill" />
                        <small>Verified</small>
                      </span>
                    </div>
                    <div className="cert__sign cert__sign--right">
                      <span className="cert__date">{formatIssuedDate(cert.issuedAt)}</span>
                      <span className="cert__rule" />
                      <span className="cert__role">Date of issue</span>
                    </div>
                  </footer>

                  <p className="cert__verify">
                    Verification ID <strong>{cert.certificateId}</strong> · Issued by {BRAND.name} · Quote this ID to {BRAND.email} to verify
                  </p>
                </div>
              </article>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
};

export default CertificatePage;
