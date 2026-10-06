import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { createOrder, verifyPayment, getCourseById, getProfile } from '../services/api';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SchedulePlanner from '../components/SchedulePlanner';
import PromoBar from '../components/PromoBar';
import { toast } from '../components/Toaster';
import { validateCoupon, markPaymentFailed, formatINR } from '../services/commerceApi';
import { addDays, formatKey, localTodayKey, suggestedDays } from '../utils/schedule';
import { BRAND, SERVER_URL } from '../brand';
import './PaymentPage.css';

const PaymentPage = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    userName: '',
    userEmail: '',
    userId: '',
    courseId: courseId || '68dd46a07f865f13c0fbda24',
    amount: 0
  });
  const [loading, setLoading] = useState(false);
  const [courseLoading, setCourseLoading] = useState(true);
  const [error, setError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);
  const [schedule, setSchedule] = useState({ start: '', end: '' });
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [discount, setDiscount] = useState(0);

  // Get logged-in user and fetch course details
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      setFormData(prev => ({
        ...prev,
        userName: parsedUser.name,
        userEmail: parsedUser.email,
        userId: parsedUser.id
      }));

      // Don't let someone pay twice: check enrollment up front
      getProfile(parsedUser.id)
        .then((res) => {
          const enrolled = (res.data?.user?.enrolledCourses || []).some(
            (e) => String(e.courseId?._id || e.courseId) === String(courseId)
          );
          setAlreadyEnrolled(enrolled);
        })
        .catch(() => {});
    }

    const fetchCourse = async () => {
      try {
        setCourseLoading(true);
        const response = await getCourseById(courseId || '68dd46a07f865f13c0fbda24');
        const courseData = response.data.data;
        setCourse(courseData);
        // Default plan: start today, finish over the program's designed length
        const start = localTodayKey();
        setSchedule({ start, end: addDays(start, suggestedDays(courseData) - 1) });
        setFormData(prev => ({
          ...prev,
          amount: courseData.price || 50000
        }));
      } catch (error) {
        console.error('Error fetching course:', error);
        setError('Failed to load course details');
      } finally {
        setCourseLoading(false);
      }
    };

    fetchCourse();
  }, [courseId]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const applyCoupon = async (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      toast.error('Enter a coupon code');
      return;
    }
    if (appliedCoupon?.code === code) {
      toast.info(`${code} is already applied`);
      return;
    }
    setCouponLoading(true);
    try {
      const res = await validateCoupon(code, course?._id || courseId);
      const quote = res.data.data;
      setAppliedCoupon({ code: quote.code, description: quote.description });
      setDiscount((current) => current + quote.discount);
      setCouponInput('');
      setCouponOpen(false);
      toast.success(`${quote.code} applied — you save ${formatINR(quote.discount)}`);
    } catch (err) {
      // the API layer already shows the reason (expired, unknown, minimum order…)
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    if (!appliedCoupon) return;
    toast.info(`${appliedCoupon.code} removed`);
    setAppliedCoupon(null);
  };

  const handleCouponKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCoupon(couponInput);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.userName || !formData.userEmail) {
      setError('Please fill all fields');
      return;
    }

    if (!schedule.start || !schedule.end) {
      setError('Pick a start date and an end date for your plan');
      return;
    }

    setLoading(true);

    try {
      // Create order
      const orderResponse = await createOrder({
        ...formData,
        startDate: schedule.start,
        endDate: schedule.end,
        couponCode: appliedCoupon?.code || undefined
      });
      const orderData = orderResponse.data.data;

      // Check if test mode
      if (orderResponse.data.testMode) {
        // Test mode - simulate payment success
        toast.success('Test mode: payment successful. Taking you to your dashboard…');

        // Verify payment in test mode
        await verifyPayment({
          razorpay_order_id: orderData.orderId,
          razorpay_payment_id: 'test_payment_' + Date.now(),
          razorpay_signature: 'test_signature',
          userId: formData.userId
        });

        // Redirect to student dashboard
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
        return;
      }

      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        setError('Failed to load payment gateway');
        setLoading(false);
        return;
      }

      // Configure Razorpay
      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: BRAND.name,
        description: course?.title || 'Course Enrollment',
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            // Verify payment and enroll user
            await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              userId: formData.userId
            });

            toast.success('Payment successful. You are enrolled in the course.');
            navigate('/dashboard');
          } catch (error) {
            setError('Payment verification failed');
          }
        },
        prefill: {
          name: formData.userName,
          email: formData.userEmail
        },
        theme: {
          color: '#0D0D0D'
        },
        modal: {
          ondismiss: function() {
            setLoading(false);
          }
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', (response) => {
        const reason = response?.error?.description || 'Payment was declined';
        markPaymentFailed(orderData.orderId, reason).catch(() => {});
        toast.error(`Payment failed: ${reason}`);
      });
      paymentObject.open();
    } catch (error) {
      console.error('Payment error:', error);
      setError(error.response?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (courseLoading) {
    return (
      <div className="pay-page">
        <SiteHeader />
        <div className="edu-loading">
          <div className="edu-spinner" role="status" aria-label="Loading course" />
          <p className="edu-label">Preparing checkout</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="pay-page">
        <SiteHeader />
        <div className="edu-container pay-missing">
          <div className="edu-empty">
            <p className="edu-label edu-label--accent">Error 404 — program</p>
            <h1 className="edu-h2">We couldn't find that <em>program.</em></h1>
            <p className="edu-muted">It may have been retired, or the link is off by a character.</p>
            <button className="edu-btn" onClick={() => navigate('/courses')}>
              Browse programs →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const coursePrice = course.price || 500;
  const totalDue = appliedCoupon ? Math.max(coursePrice - discount, 0) : coursePrice;
  const totalModules = course.modules?.length || 0;
  const totalLessons = course.modules?.reduce((acc, mod) => acc + (mod.lessons?.length || 0), 0) || 0;

  const thumb = course.thumbnail
    ? (/^https?:\/\//.test(course.thumbnail) ? course.thumbnail : `${SERVER_URL}${course.thumbnail}`)
    : null;

  const receiptNo = `EDU-${String(course._id || courseId || '').slice(-6).toUpperCase()}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="pay-page">
      <SiteHeader />
      {!alreadyEnrolled && <PromoBar onApply={applyCoupon} appliedCode={appliedCoupon?.code} />}

      <div className="edu-container pay-wrap">
        <div className="pay-crumbs">
          <Link to="/courses" className="pay-back">← All programs</Link>
          <ol className="pay-steps" aria-label="Checkout steps">
            <li className="is-done"><span>01</span> Choose</li>
            <li className="is-current" aria-current="step"><span>02</span> Pay</li>
            <li><span>03</span> Start</li>
          </ol>
        </div>

        <div className="pay-grid">
          {/* ---------- Course summary ---------- */}
          <section className="pay-course" aria-labelledby="pay-course-title">
            <p className="edu-label edu-label--accent">You're enrolling in</p>

            <div className="pay-course__head">
              {course.category && <span className="edu-tag">{course.category}</span>}
              <h1 id="pay-course-title" className="edu-display pay-course__title">{course.title}</h1>
              {course.description && <p className="pay-course__desc">{course.description}</p>}
            </div>

            <figure className="pay-course__figure">
              {thumb && !imgFailed ? (
                <img src={thumb} alt="" onError={() => setImgFailed(true)} />
              ) : (
                <div className="pay-course__placeholder" aria-hidden="true">
                  {course.title?.charAt(0)}
                </div>
              )}
            </figure>

            <dl className="pay-facts">
              <div>
                <dt>Modules</dt>
                <dd>{String(totalModules).padStart(2, '0')}</dd>
              </div>
              <div>
                <dt>Lessons</dt>
                <dd>{String(totalLessons).padStart(2, '0')}</dd>
              </div>
              {course.duration && (
                <div>
                  <dt>Length</dt>
                  <dd>{course.duration}</dd>
                </div>
              )}
              {course.instructor && (
                <div>
                  <dt>Mentor</dt>
                  <dd>{course.instructor}</dd>
                </div>
              )}
            </dl>

            <p className="edu-label pay-includes__label">Included, no extra charge</p>
            <ul className="pay-includes">
              <li><span className="pay-includes__mark" aria-hidden="true" />Certificate when you finish the final project</li>
              <li><span className="pay-includes__mark" aria-hidden="true" />AI summaries of every lesson document</li>
              <li><span className="pay-includes__mark" aria-hidden="true" />Lifetime access to every lesson and update</li>
            </ul>
          </section>

          {/* ---------- Receipt ---------- */}
          <aside className="pay-receipt-col">
            <form className="edu-pop pay-receipt" onSubmit={handlePayment} noValidate={false}>
              <header className="pay-receipt__head">
                <div>
                  <p className="pay-receipt__brand">{BRAND.name}</p>
                  <p className="pay-receipt__meta">Enrollment receipt</p>
                </div>
                <div className="pay-receipt__no">
                  <p className="pay-receipt__meta">No. {receiptNo}</p>
                  <p className="pay-receipt__meta">{today}</p>
                </div>
              </header>

              <div className="pay-receipt__section">
                <p className="pay-receipt__label">Billed to</p>
                {user && <p className="pay-receipt__signed">Signed in as {user.email}</p>}

                <div className="edu-field">
                  <label htmlFor="userName">Full name</label>
                  <input
                    type="text"
                    className="edu-input"
                    id="userName"
                    name="userName"
                    value={formData.userName}
                    onChange={handleInputChange}
                    placeholder="Name for the certificate"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="edu-field">
                  <label htmlFor="userEmail">Email</label>
                  <input
                    type="email"
                    className="edu-input"
                    id="userEmail"
                    name="userEmail"
                    value={formData.userEmail}
                    onChange={handleInputChange}
                    placeholder="Where we send the receipt"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="pay-receipt__section">
                <p className="pay-receipt__label">Plan your pace</p>
                <p className="pay-receipt__hint">Choose when you start and when you want to finish. You can change it later from your dashboard.</p>
                <SchedulePlanner course={course} value={schedule} onChange={setSchedule} />
              </div>

              <div className="pay-receipt__section">
                <p className="pay-receipt__label">Items</p>
                <ul className="pay-lines">
                  <li>
                    <span className="pay-lines__name">{course.title}</span>
                    <span className="pay-lines__dots" aria-hidden="true" />
                    <span>{formatINR(coursePrice)}</span>
                  </li>
                  <li>
                    <span className="pay-lines__name">Your plan</span>
                    <span className="pay-lines__dots" aria-hidden="true" />
                    <span>
                      {schedule.start && schedule.end
                        ? `${formatKey(schedule.start, { day: 'numeric', month: 'short' })} → ${formatKey(schedule.end, { day: 'numeric', month: 'short' })}`
                        : '—'}
                    </span>
                  </li>
                  {appliedCoupon && (
                    <li className="pay-lines__discount">
                      <span className="pay-lines__name">Coupon {appliedCoupon.code}</span>
                      <span className="pay-lines__dots" aria-hidden="true" />
                      <span>−{formatINR(discount)}</span>
                    </li>
                  )}
                  <li>
                    <span className="pay-lines__name">Certificate</span>
                    <span className="pay-lines__dots" aria-hidden="true" />
                    <span>{formatINR(0)}</span>
                  </li>
                  <li>
                    <span className="pay-lines__name">Taxes</span>
                    <span className="pay-lines__dots" aria-hidden="true" />
                    <span>{formatINR(0)}</span>
                  </li>
                </ul>
              </div>

              {!alreadyEnrolled && (
                <div className="pay-coupon">
                  {appliedCoupon ? (
                    <div className="pay-coupon__applied">
                      <span className="pay-coupon__chip">
                        <span className="pay-coupon__tick" aria-hidden="true" />
                        {appliedCoupon.code}
                      </span>
                      <span className="pay-coupon__desc">{appliedCoupon.description || 'Coupon applied'}</span>
                      <button type="button" className="pay-coupon__remove" onClick={removeCoupon}>
                        Remove
                      </button>
                    </div>
                  ) : couponOpen ? (
                    <div className="pay-coupon__form">
                      <label htmlFor="couponCode" className="pay-receipt__label">Coupon code</label>
                      <div className="pay-coupon__row">
                        <input
                          id="couponCode"
                          type="text"
                          className="edu-input pay-coupon__input"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={handleCouponKey}
                          placeholder="e.g. EDU20"
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={32}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="edu-btn edu-btn--sm pay-coupon__apply"
                          onClick={() => applyCoupon(couponInput)}
                          disabled={couponLoading || !couponInput.trim()}
                        >
                          {couponLoading ? 'Checking…' : 'Apply'}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="pay-coupon__cancel"
                        onClick={() => { setCouponOpen(false); setCouponInput(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="pay-coupon__toggle" onClick={() => setCouponOpen(true)}>
                      Have a code? <span aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
              )}

              <div className="pay-total">
                <span className="pay-receipt__label">Total due</span>
                <span className="pay-total__amount">{formatINR(totalDue)}</span>
                <span className="pay-total__note">
                  {appliedCoupon
                    ? <>You save {formatINR(coursePrice - totalDue)}. One-time, no renewal.</>
                    : 'One-time. No subscription, no renewal.'}
                </span>
              </div>

              {error && (
                <div className="edu-alert edu-alert--error pay-alert" role="alert">
                  {error}
                </div>
              )}

              {alreadyEnrolled ? (
                <div className="pay-enrolled">
                  <p><strong>You're already enrolled</strong> in this program — no need to pay again.</p>
                  <button
                    type="button"
                    className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block"
                    onClick={() => navigate(`/lms/${courseId}`)}
                  >
                    Go to classroom <span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : (
              <button
                type="submit"
                className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block pay-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="pay-dot" aria-hidden="true" />
                    Processing…
                  </>
                ) : (
                  <>Pay {formatINR(totalDue)} <span aria-hidden="true">→</span></>
                )}
              </button>
              )}

              <footer className="pay-receipt__foot">
                <p>Secure payment via Razorpay. Card details never touch our servers.</p>
                <p>
                  <span className="pay-receipt__test">Test mode</span>
                  If the server runs without Razorpay keys, payment is simulated and you're enrolled instantly.
                </p>
              </footer>
            </form>
          </aside>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
};

export default PaymentPage;
