import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './LandingPage.css';
import SiteHeader from '../components/SiteHeader';
import PromoBar from '../components/PromoBar';
import SiteFooter from '../components/SiteFooter';
import { getAllCourses } from '../services/api';
import { CATEGORIES, SERVER_URL } from '../brand';

const SKILLS = [
  'Financial modelling', 'SQL', 'React', 'Python', 'Power BI', 'Valuation',
  'Product thinking', 'Performance marketing', 'Cloud', 'Negotiation',
  'Statistics', 'Copywriting', 'System design'
];

const METHOD = [
  { n: '01', title: 'Watch', body: 'Short lessons you finish on a commute. No three-hour lectures, no filler.' },
  { n: '02', title: 'Build', body: 'Every module ends with a real brief — a model, an app, a campaign.' },
  { n: '03', title: 'Get reviewed', body: 'A working practitioner marks your work line by line. Then you fix it.' },
  { n: '04', title: 'Show it', body: 'You leave with finished work people can open, not a folder of certificates.' }
];

const VOICES = [
  {
    quote: 'The reviews were blunt in the best way. My third model was nothing like my first.',
    name: 'Aditi R.',
    meta: 'Finance · now Analyst'
  },
  {
    quote: 'Two years of tutorials. Six weeks of shipping every Friday did more.',
    name: 'Karan M.',
    meta: 'Technology · Frontend Dev'
  },
  {
    quote: 'Small group, a mentor who remembered my work. That is the whole trick.',
    name: 'Neha S.',
    meta: 'Marketing · Growth Lead'
  }
];

const FAQ = [
  {
    q: 'Do I need prior experience?',
    a: 'No. Each program states its starting point. Beginner tracks assume nothing beyond curiosity and about 6–8 hours a week.'
  },
  {
    q: 'How are classes run?',
    a: 'Recorded lessons for concepts, one live class and one studio hour each week, plus a weekly assignment reviewed by your mentor.'
  },
  {
    q: 'Can I choose my own pace?',
    a: 'Yes. Pick any start and end date when you enrol — one intense week or a relaxed few months. We show how many hours a day your plan needs, and you can change it any time from your dashboard.'
  },
  {
    q: 'Can I get a summary of the reading material?',
    a: 'Yes. Documents attached to lessons can be summarised by AI inside the classroom, so you revise faster.'
  },
  {
    q: 'What if I fall behind?',
    a: 'All lessons stay available. Your mentor can move your review slot so you catch up without losing your place.'
  }
];

const thumbUrl = (thumb) => {
  if (!thumb) return null;
  return /^https?:\/\//.test(thumb) ? thumb : `${SERVER_URL}${thumb}`;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('finance');
  const [selectedInterest, setSelectedInterest] = useState(null);
  const [quizError, setQuizError] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    getAllCourses()
      .then((res) => setCourses(res.data?.data || []))
      .catch(() => setCourses([]))
      .finally(() => setCoursesLoading(false));
  }, []);

  // Header links on other pages send us here with a section to scroll to
  useEffect(() => {
    const target = location.state?.scrollTo;
    if (target) {
      setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [location.state]);

  const countByCategory = useMemo(() => {
    const counts = {};
    courses.forEach((c) => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [courses]);

  const visibleCourses = courses.filter((c) => c.category === activeCategory).slice(0, 3);

  const handleQuizNext = () => {
    if (selectedInterest) {
      navigate('/courses', { state: { interest: selectedInterest } });
    } else {
      setQuizError(true);
    }
  };

  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });

  return (
    <div className="landing">
      <SiteHeader />
      <PromoBar />

      {/* Hero */}
      <section className="lp-hero">
        <div className="edu-container lp-hero__grid">
          <div className="lp-hero__copy">
            <p className="lp-hero__kicker">
              <span className="lp-dot" aria-hidden="true" />
              Admissions open · start any day, finish at your pace
            </p>
            <h1 className="edu-display lp-hero__title">
              Skills that<br /><em>pay off.</em>
            </h1>
            <p className="edu-lead lp-hero__lead">
              Mentor-led programs for people who'd rather build than binge tutorials.
              Small cohorts. Real briefs. Every piece of work reviewed by someone who does this for a living.
            </p>
            <div className="lp-hero__cta">
              <button className="edu-btn edu-btn--lg edu-btn--accent" onClick={() => navigate('/courses')}>
                Browse programs →
              </button>
              <button className="edu-btn edu-btn--lg edu-btn--ghost" onClick={() => document.getElementById('method')?.scrollIntoView({ behavior: 'smooth' })}>
                How it works
              </button>
            </div>
          </div>

          {/* The pass — a membership card */}
          <div className="lp-pass-wrap" aria-hidden="true">
            <div className="lp-pass">
              <div className="lp-pass__top">
                <span className="lp-pass__brand"><em>Edu</em> Learning</span>
                <span className="lp-pass__tier">Learner pass</span>
              </div>
              <div className="lp-pass__chip" />
              <div className="lp-pass__number">
                <span>0014</span><span>1:12</span><span>YOUR</span><span>PACE</span>
              </div>
              <div className="lp-pass__bottom">
                <div>
                  <span className="lp-pass__k">Member</span>
                  <span className="lp-pass__v">You, probably</span>
                </div>
                <div>
                  <span className="lp-pass__k">Starts</span>
                  <span className="lp-pass__v">{todayLabel}</span>
                </div>
              </div>
            </div>
            <div className="lp-pass lp-pass--back" />
          </div>
        </div>

        <div className="edu-container">
          <dl className="lp-facts">
            <div><dt>Mentor ratio</dt><dd>1:12</dd></div>
            <div><dt>Programs</dt><dd>{courses.length || 15}</dd></div>
            <div><dt>Fields</dt><dd>{CATEGORIES.length}</dd></div>
            <div><dt>Graded by</dt><dd>Humans</dd></div>
          </dl>
        </div>
      </section>

      {/* Skills ticker */}
      <div className="lp-ticker edu-marquee" aria-hidden="true">
        <div className="edu-marquee__track">
          {[...SKILLS, ...SKILLS].map((s, i) => <span key={i}>{s}</span>)}
        </div>
      </div>

      {/* Programs */}
      <section className="edu-section" id="programs">
        <div className="edu-container">
          <div className="lp-head">
            <p className="edu-index"><span>01</span><span>Programs</span></p>
            <h2 className="edu-h1">Pick a field.<br /><em>Start this month.</em></h2>
          </div>

          <div className="lp-chips" role="tablist">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={activeCategory === c.key}
                className={`lp-chip${activeCategory === c.key ? ' is-active' : ''}`}
                onClick={() => setActiveCategory(c.key)}
              >
                {c.label}
                <span className="lp-chip__count">{countByCategory[c.key] || 0}</span>
              </button>
            ))}
          </div>

          {coursesLoading && <div className="lp-state"><span className="edu-spinner" /></div>}
          {!coursesLoading && visibleCourses.length === 0 && (
            <div className="lp-state edu-muted">Programs in this field are being updated. See the full list instead.</div>
          )}

          <div className="lp-programs">
            {visibleCourses.map((course, i) => (
              <article key={course._id} className="lp-program">
                <div className="lp-program__media">
                  {thumbUrl(course.thumbnail) && <img src={thumbUrl(course.thumbnail)} alt="" loading="lazy" />}
                  <span className="lp-program__num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="lp-program__body">
                  <div className="lp-program__meta">
                    <span>{course.duration || 'Self-paced'}</span>
                    <span>{course.modules?.length || 0} {course.modules?.length === 1 ? 'module' : 'modules'}</span>
                  </div>
                  <h3 className="lp-program__title">{course.title}</h3>
                  <p className="lp-program__desc">{course.description}</p>
                  <div className="lp-program__foot">
                    <span className="lp-program__price">
                      <small>₹</small>{Number(course.price || 0).toLocaleString('en-IN')}
                    </span>
                    <button className="edu-btn edu-btn--sm" onClick={() => navigate(`/payment/${course._id}`)}>
                      Enroll →
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="lp-programs__all">
            <button className="edu-link" onClick={() => navigate('/courses', { state: { interest: activeCategory } })}>
              All {CATEGORIES.find((c) => c.key === activeCategory)?.label} programs →
            </button>
          </div>
        </div>
      </section>

      {/* Method */}
      <section className="edu-section edu-section--ink" id="method">
        <div className="edu-container">
          <div className="lp-head lp-head--split">
            <div>
              <p className="edu-index"><span>02</span><span>The loop</span></p>
              <h2 className="edu-h1">Four steps.<br /><em>Every week.</em></h2>
            </div>
            <p className="edu-lead">Nothing clever. The loop that works when you learn a trade: see it, try it, get corrected, try again.</p>
          </div>

          <ol className="lp-method">
            {METHOD.map((m) => (
              <li key={m.n} className="lp-method__row">
                <span className="lp-method__n">{m.n}</span>
                <h3 className="lp-method__title">{m.title}</h3>
                <p className="lp-method__body">{m.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Quiz */}
      <section className="edu-section lp-quiz">
        <div className="edu-container">
          <div className="lp-head lp-head--center">
            <p className="edu-index"><span>03</span><span>Not sure yet?</span></p>
            <h2 className="edu-h1">What do you want<br />to <em>get good at?</em></h2>
          </div>

          <div className="lp-quiz__options" role="radiogroup" aria-label="Field of interest">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                role="radio"
                aria-checked={selectedInterest === c.key}
                className={`lp-quiz__option${selectedInterest === c.key ? ' is-selected' : ''}`}
                onClick={() => { setSelectedInterest(c.key); setQuizError(false); }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="lp-quiz__foot">
            {quizError && <p className="lp-quiz__error">Pick one to continue.</p>}
            <button className="edu-btn edu-btn--lg edu-btn--accent" onClick={handleQuizNext}>
              Show my programs →
            </button>
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section className="edu-section edu-section--ink" id="outcomes">
        <div className="edu-container">
          <div className="lp-head">
            <p className="edu-index"><span>04</span><span>Outcomes</span></p>
            <h2 className="edu-h1">No star ratings.<br /><em>Just people.</em></h2>
          </div>

          <div className="lp-voices">
            {VOICES.map((v) => (
              <figure key={v.name} className="lp-voice">
                <span className="lp-voice__mark" aria-hidden="true">“</span>
                <blockquote>{v.quote}</blockquote>
                <figcaption>
                  <strong>{v.name}</strong>
                  <span className="edu-label">{v.meta}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="lp-film">
            <div className="lp-film__frame">
              <video
                controls
                preload="none"
                poster="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=675&fit=crop"
              >
                <source src={`${SERVER_URL}/public/Vinay_jain.mp4`} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="lp-film__caption">
              <span className="edu-label edu-label--accent">Film · 02:40</span>
              <span>One learner's six weeks, start to finish.</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="edu-section" id="faq">
        <div className="edu-container lp-faq">
          <div>
            <p className="edu-index"><span>05</span><span>Questions</span></p>
            <h2 className="edu-h1 lp-faq__title">Fair<br /><em>questions.</em></h2>
          </div>
          <div className="lp-faq__list">
            {FAQ.map((item, i) => (
              <div key={item.q} className={`lp-faq__item${openFaq === i ? ' is-open' : ''}`}>
                <button
                  className="lp-faq__q"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                >
                  <span>{item.q}</span>
                  <span className="lp-faq__sign" aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <p className="lp-faq__a">{item.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

export default LandingPage;
