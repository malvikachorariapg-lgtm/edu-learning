import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { toast } from '../components/Toaster';
import { getCourseQuiz, submitQuizAttempt } from '../services/learningApi';
import './QuizPage.css';

const pad = (n) => String(n).padStart(2, '0');
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const QuizPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ loading: true, error: null, quiz: null, course: null, history: null });
  const [phase, setPhase] = useState('intro'); // intro | question | review | result
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await getCourseQuiz(courseId, { silent: true });
      const { quiz, course, history } = res.data.data;
      setState({ loading: false, error: null, quiz, course, history });
    } catch (err) {
      const status = err.response?.status;
      setState({
        loading: false,
        quiz: null,
        course: null,
        history: null,
        error: {
          status,
          message: err.response?.data?.message || 'We couldn’t load this quiz. Check your connection and try again.'
        }
      });
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  // Move focus to the question heading whenever the screen changes (screen readers + keyboard users)
  useEffect(() => {
    if (phase !== 'intro') headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase, index]);

  const quiz = state.quiz;
  const questions = useMemo(() => quiz?.questions || [], [quiz]);
  const total = questions.length;
  const question = questions[index];
  const answeredCount = questions.filter((q) => (answers[q.id] || []).length > 0).length;

  const choose = (q, key) => {
    setAnswers((prev) => {
      const current = prev[q.id] || [];
      if (q.type === 'single') return { ...prev, [q.id]: [key] };
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, [q.id]: next };
    });
  };

  const start = () => {
    setAnswers({});
    setResult(null);
    setIndex(0);
    setPhase('question');
  };

  const goNext = () => {
    if (index < total - 1) setIndex(index + 1);
    else setPhase('review');
  };

  const goBack = () => {
    if (index > 0) setIndex(index - 1);
    else setPhase('intro');
  };

  const editQuestion = (i) => {
    setIndex(i);
    setPhase('question');
  };

  const submit = async () => {
    if (submitting) return;
    if (answeredCount < total) {
      toast.info(`Answer all ${total} questions before submitting.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitQuizAttempt(courseId, answers);
      const data = res.data.data;
      setResult(data);
      setPhase('result');
      setState((s) => {
        const best = s.history?.best;
        const isBest = !best || data.percent > best.percent;
        return {
          ...s,
          history: {
            ...(s.history || {}),
            attemptsCount: (s.history?.attemptsCount || 0) + 1,
            everPassed: Boolean(s.history?.everPassed || data.passed),
            best: isBest
              ? { score: data.score, total: data.total, percent: data.percent, passed: data.passed, at: new Date().toISOString() }
              : best
          }
        };
      });
      if (data.passed) toast.success(`Quiz passed with ${data.percent}%`);
      else toast.info(`You scored ${data.percent}%. ${data.passPercent}% is needed to pass.`);
    } catch (err) {
      // the API layer already surfaced the error
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts on a question screen: 1–5 / A–E pick an option, Enter continues
  useEffect(() => {
    if (phase !== 'question' || !question) return undefined;
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'textarea' || (tag === 'input' && !['radio', 'checkbox'].includes(e.target.type))) return;
      const k = e.key.toLowerCase();
      let pos = -1;
      if (/^[1-9]$/.test(k)) pos = Number(k) - 1;
      else if (/^[a-f]$/.test(k)) pos = k.charCodeAt(0) - 97;
      if (pos >= 0 && pos < question.options.length) {
        e.preventDefault();
        choose(question, question.options[pos].key);
      } else if (k === 'enter' && tag !== 'button' && tag !== 'a' && (answers[question.id] || []).length) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const classroomLink = `/lms/${courseId}`;
  const shellProps = {
    nav: learnerNav('lms'),
    eyebrow: state.course ? `Quiz · ${state.course.title}` : 'Quiz',
    title: phase === 'result' ? <>Your <em>results</em></> : <>Knowledge <em>check</em></>,
    actions: (
      <Link to={classroomLink} className="edu-btn edu-btn--ghost edu-btn--sm qz-back" aria-label="Back to classroom">
        <span aria-hidden="true">←</span> <span className="qz-back__text">Classroom</span>
      </Link>
    )
  };

  if (state.loading) {
    return (
      <AppShell {...shellProps}>
        <div className="edu-loading">
          <div className="edu-spinner" role="status" aria-label="Loading quiz" />
          <p className="edu-label">Loading the quiz</p>
        </div>
      </AppShell>
    );
  }

  if (state.error) {
    const notEnrolled = state.error.status === 403;
    return (
      <AppShell {...shellProps}>
        <div className="qz">
          <div className="edu-empty qz-empty">
            <p className="edu-label edu-label--accent">{notEnrolled ? 'Enrolled learners only' : 'Quiz unavailable'}</p>
            <h2 className="edu-h3">{notEnrolled ? <>This quiz is <em>locked</em></> : <>We hit a <em>snag</em></>}</h2>
            <p className="edu-muted">{state.error.message}</p>
            <div className="qz-empty__actions">
              {notEnrolled ? (
                <button className="edu-btn edu-btn--accent" onClick={() => navigate(`/courses/${courseId}`)}>View program</button>
              ) : state.error.status === 404 ? null : (
                <button className="edu-btn" onClick={load}>Try again</button>
              )}
              <Link to={classroomLink} className="edu-btn edu-btn--ghost">Back to classroom</Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const history = state.history || {};

  /* ---------------- Intro ---------------- */
  if (phase === 'intro') {
    const multiCount = questions.filter((q) => q.type === 'multi').length;
    return (
      <AppShell {...shellProps}>
        <div className="qz">
          <section className="qz-intro edu-pop">
            <div className="qz-intro__main">
              <p className="edu-label edu-label--accent">{state.course?.category || 'Course'} · knowledge check</p>
              <h2 className="qz-intro__title">{quiz.title}</h2>
              <p className="qz-intro__desc">{quiz.description}</p>
              <ul className="qz-intro__rules">
                <li><i className="bi bi-check-lg" aria-hidden="true" />One question per screen — go back and change answers any time before you submit</li>
                {multiCount > 0 && (
                  <li><i className="bi bi-check-lg" aria-hidden="true" />{multiCount === 1 ? 'One question asks' : `${multiCount} questions ask`} you to select all that apply — every right option, nothing extra</li>
                )}
                <li><i className="bi bi-check-lg" aria-hidden="true" />See explanations for every question once you submit</li>
              </ul>
              <div className="qz-intro__cta">
                <button className="edu-btn edu-btn--accent edu-btn--lg" onClick={start}>
                  {history.attemptsCount ? 'Retake quiz' : 'Start quiz'} <span aria-hidden="true">→</span>
                </button>
                <span className="qz-intro__hint">Tip: use keys 1–{Math.min(5, Math.max(...questions.map((q) => q.options.length)))} to pick and Enter to continue</span>
              </div>
            </div>
            <dl className="qz-intro__facts">
              <div><dt>Questions</dt><dd>{pad(total)}</dd></div>
              <div><dt>Pass mark</dt><dd>{quiz.passPercent}<small>%</small></dd></div>
              <div><dt>Attempts</dt><dd>{pad(history.attemptsCount || 0)}</dd></div>
              <div>
                <dt>Best score</dt>
                <dd>
                  {history.best ? <>{history.best.percent}<small>%</small></> : '—'}
                </dd>
                {history.best && (
                  <span className={`qz-chip ${history.best.passed ? 'qz-chip--pass' : 'qz-chip--fail'}`}>
                    {history.best.passed ? 'Passed' : 'Not passed'} · {formatDate(history.best.at)}
                  </span>
                )}
              </div>
            </dl>
          </section>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Question ---------------- */
  if (phase === 'question' && question) {
    const picked = answers[question.id] || [];
    const isMulti = question.type === 'multi';
    const progress = ((index + 1) / total) * 100;
    return (
      <AppShell {...shellProps}>
        <div className="qz">
          <div className="qz-progress">
            <div className="qz-progress__row">
              <span className="qz-progress__count">Q <strong>{index + 1}</strong> of {total}</span>
              <span className="edu-label">{answeredCount} answered</span>
            </div>
            <div
              className="qz-progress__track"
              role="progressbar"
              aria-label="Quiz progress"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={index + 1}
            >
              {questions.map((q, i) => (
                <span
                  key={q.id}
                  className={`qz-progress__seg${i < index ? ' is-past' : ''}${i === index ? ' is-current' : ''}${(answers[q.id] || []).length ? ' is-answered' : ''}`}
                />
              ))}
            </div>
            <span className="qz-sr">{Math.round(progress)}% through the quiz</span>
          </div>

          <section className="qz-card" aria-labelledby="qz-question">
            <div className="qz-card__meta">
              <span className="qz-card__num">{pad(index + 1)}</span>
              <span className={`qz-type${isMulti ? ' qz-type--multi' : ''}`}>
                {isMulti ? 'Select all that apply' : 'Choose one'}
              </span>
            </div>
            <h2 id="qz-question" className="qz-card__q" tabIndex={-1} ref={headingRef}>{question.text}</h2>

            <fieldset className="qz-options">
              <legend className="qz-sr">{isMulti ? 'Select all options that apply' : 'Choose one option'}</legend>
              {question.options.map((opt, i) => {
                const checked = picked.includes(opt.key);
                const id = `qz-${question.id}-${opt.key}`;
                return (
                  <label key={opt.key} htmlFor={id} className={`qz-opt${checked ? ' is-checked' : ''}${isMulti ? ' qz-opt--multi' : ''}`}>
                    <input
                      id={id}
                      className="qz-opt__input"
                      type={isMulti ? 'checkbox' : 'radio'}
                      name={`q-${question.id}`}
                      value={opt.key}
                      checked={checked}
                      onChange={() => choose(question, opt.key)}
                    />
                    <span className="qz-opt__key" aria-hidden="true">{LETTERS[i]}</span>
                    <span className="qz-opt__text">{opt.text}</span>
                    <span className="qz-opt__mark" aria-hidden="true">
                      {checked && <i className="bi bi-check-lg" />}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {isMulti && (
              <p className="qz-card__note">
                {picked.length === 0 ? 'Pick every option that applies.' : `${picked.length} selected`}
              </p>
            )}
          </section>

          <nav className="qz-nav" aria-label="Question navigation">
            <button className="edu-btn edu-btn--ghost" onClick={goBack}>
              <span aria-hidden="true">←</span> {index === 0 ? 'Intro' : 'Back'}
            </button>
            <button className="edu-btn edu-btn--accent" onClick={goNext} disabled={picked.length === 0}>
              {index === total - 1 ? 'Review answers' : 'Next'} <span aria-hidden="true">→</span>
            </button>
          </nav>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Review ---------------- */
  if (phase === 'review') {
    const missing = total - answeredCount;
    return (
      <AppShell {...shellProps}>
        <div className="qz">
          <header className="qz-head">
            <p className="edu-label edu-label--accent">Before you submit</p>
            <h2 className="qz-head__title" tabIndex={-1} ref={headingRef}>Review your <em>answers</em></h2>
            <p className="edu-muted">
              {missing
                ? `${missing} question${missing === 1 ? ' is' : 's are'} still unanswered.`
                : 'Everything is answered. Change anything you like, then submit.'}
            </p>
          </header>

          <ol className="qz-review">
            {questions.map((q, i) => {
              const picked = answers[q.id] || [];
              // Show picks in the order the options appear
              const chosen = q.options.map((o, oi) => ({ ...o, letter: LETTERS[oi] })).filter((o) => picked.includes(o.key));
              return (
                <li key={q.id} className={`qz-review__item${chosen.length ? '' : ' is-missing'}`}>
                  <span className="qz-review__num">{pad(i + 1)}</span>
                  <div className="qz-review__body">
                    <p className="qz-review__q">{q.text}</p>
                    {chosen.length ? (
                      <ul className="qz-review__picks">
                        {chosen.map((o) => (
                          <li key={o.key}><span className="qz-review__letter">{o.letter}</span>{o.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="qz-review__none">Not answered</p>
                    )}
                  </div>
                  <button className="edu-btn edu-btn--ghost edu-btn--sm qz-review__edit" onClick={() => editQuestion(i)}>
                    {chosen.length ? 'Change' : 'Answer'}<span className="qz-sr"> question {i + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <nav className="qz-nav" aria-label="Submit quiz">
            <button className="edu-btn edu-btn--ghost" onClick={() => editQuestion(total - 1)}>
              <span aria-hidden="true">←</span> Back
            </button>
            <button className="edu-btn edu-btn--accent edu-btn--lg" onClick={submit} disabled={submitting || missing > 0}>
              {submitting ? <><span className="qz-spin" aria-hidden="true" /> Submitting…</> : <>Submit answers <span aria-hidden="true">→</span></>}
            </button>
          </nav>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Result ---------------- */
  if (phase === 'result' && result) {
    const byId = new Map(result.results.map((r) => [String(r.questionId), r]));
    return (
      <AppShell {...shellProps}>
        <div className="qz">
          <section className={`qz-score edu-pop ${result.passed ? 'is-pass' : 'is-fail'}`} aria-live="polite">
            <div className="qz-score__fig">
              <span className="qz-score__pct">{result.percent}<small>%</small></span>
              <span className="edu-label">{result.score} of {result.total} correct</span>
            </div>
            <div className="qz-score__text">
              <span className={`qz-chip ${result.passed ? 'qz-chip--pass' : 'qz-chip--fail'}`}>
                <i className={`bi ${result.passed ? 'bi-check-lg' : 'bi-x-lg'}`} aria-hidden="true" />
                {result.passed ? 'Passed' : 'Not passed'}
              </span>
              <h2 className="qz-score__title" tabIndex={-1} ref={headingRef}>
                {result.passed ? <>Nicely <em>done</em>.</> : <>So <em>close</em>.</>}
              </h2>
              <p className="qz-score__copy">
                {result.passed
                  ? `You cleared the ${result.passPercent}% pass mark. Review the explanations below to lock it in.`
                  : `You need ${result.passPercent}% to pass. Read through the explanations, revisit the lessons and try again.`}
              </p>
              <div className="qz-score__actions">
                <button className="edu-btn edu-btn--accent" onClick={start}>Retake quiz</button>
                <Link to={classroomLink} className="edu-btn edu-btn--ghost">Back to classroom</Link>
              </div>
            </div>
          </section>

          <header className="qz-head qz-head--tight">
            <p className="edu-label">Question by question</p>
          </header>

          <ol className="qz-results">
            {questions.map((q, i) => {
              const r = byId.get(String(q.id));
              if (!r) return null;
              const picked = answers[q.id] || [];
              return (
                <li key={q.id} className={`qz-res ${r.correct ? 'is-right' : 'is-wrong'}`}>
                  <div className="qz-res__head">
                    <span className="qz-res__num">{pad(i + 1)}</span>
                    <p className="qz-res__q">{q.text}</p>
                    <span className={`qz-chip ${r.correct ? 'qz-chip--pass' : 'qz-chip--fail'}`}>
                      {r.correct ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  {q.type === 'multi' && <p className="qz-res__type">Select all that apply</p>}
                  <ul className="qz-res__opts">
                    {q.options.map((o, oi) => {
                      const isAnswer = r.correctKeys.includes(o.key);
                      const isPicked = picked.includes(o.key);
                      const cls = isAnswer ? 'is-answer' : isPicked ? 'is-miss' : '';
                      return (
                        <li key={o.key} className={`qz-res__opt ${cls}${isPicked ? ' is-picked' : ''}`}>
                          <span className="qz-res__letter" aria-hidden="true">{LETTERS[oi]}</span>
                          <span className="qz-res__otext">{o.text}</span>
                          <span className="qz-res__flags">
                            {isPicked && <span className="qz-res__flag">Your answer</span>}
                            {isAnswer && <span className="qz-res__flag qz-res__flag--ok"><i className="bi bi-check-lg" aria-hidden="true" /> Correct</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {r.explanation && (
                    <p className="qz-res__why"><span className="edu-label edu-label--accent">Why</span>{r.explanation}</p>
                  )}
                </li>
              );
            })}
          </ol>

          <nav className="qz-nav" aria-label="After the quiz">
            <Link to={classroomLink} className="edu-btn edu-btn--ghost"><span aria-hidden="true">←</span> Classroom</Link>
            <button className="edu-btn edu-btn--accent" onClick={start}>Retake quiz</button>
          </nav>
        </div>
      </AppShell>
    );
  }

  return null;
};

export default QuizPage;
