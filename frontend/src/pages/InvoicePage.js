import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import { getOrder, formatINR, ORDER_STATUS } from '../services/commerceApi';
import { BRAND } from '../brand';
import './InvoicePage.css';

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '—';

const STATUS_COPY = {
  paid: 'Paid in full',
  pending: 'Awaiting payment',
  failed: 'Payment failed'
};

const InvoicePage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setProblem(null);
    getOrder(orderId, { silent: true })
      .then((res) => { if (alive) setOrder(res.data.data); })
      .catch((err) => {
        if (!alive) return;
        const status = err.response?.status;
        setProblem({
          status,
          message: err.response?.data?.message ||
            (err.response ? 'Something went wrong loading this invoice.' : 'Can’t reach the server. Check your connection and try again.')
        });
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [orderId]);

  const invoiceNo = order ? `INV-${String(order.id).slice(-8).toUpperCase()}` : '';
  const statusMeta = order ? ORDER_STATUS[order.status] || { label: order.status, tone: 'soft' } : null;

  return (
    <AppShell
      nav={learnerNav('orders')}
      eyebrow="Billing"
      title="Invoice"
      actions={
        order && (
          <button className="edu-btn edu-btn--accent edu-btn--sm inv-top-btn" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        )
      }
    >
      <div className="inv">
        <div className="inv-bar">
          <Link to="/orders" className="inv-back">← All orders</Link>
        </div>

        {loading ? (
          <div className="edu-loading inv-loading">
            <div className="edu-spinner" role="status" aria-label="Loading invoice" />
            <p className="edu-label">Preparing invoice</p>
          </div>
        ) : problem ? (
          <div className="edu-empty inv-empty">
            <p className="edu-label edu-label--accent">
              {problem.status === 403 ? 'Error 403 — private' : problem.status === 404 ? 'Error 404 — order' : 'Something went wrong'}
            </p>
            <h2 className="edu-h3">
              {problem.status === 403
                ? <>This invoice belongs to <em>another account.</em></>
                : problem.status === 404
                  ? <>We couldn't find that <em>order.</em></>
                  : <>Couldn't load the <em>invoice.</em></>}
            </h2>
            <p className="edu-muted">{problem.message}</p>
            <button className="edu-btn edu-btn--sm" onClick={() => navigate('/orders')}>Back to your orders</button>
          </div>
        ) : order && (
          <>
            <article className="edu-pop inv-doc" aria-label={`Invoice ${invoiceNo}`}>
              <header className="inv-doc__head">
                <div>
                  <p className="inv-doc__brand">{BRAND.name}</p>
                  <p className="inv-doc__muted">{BRAND.email}</p>
                </div>
                <div className="inv-doc__title">
                  <p className="edu-label">{order.status === 'paid' ? 'Tax invoice / receipt' : 'Order summary'}</p>
                  <p className="inv-doc__no">{invoiceNo}</p>
                </div>
              </header>

              <div className={`inv-stamp inv-stamp--${statusMeta.tone}`}>
                <span className="inv-stamp__dot" aria-hidden="true" />
                {STATUS_COPY[order.status] || statusMeta.label}
                {order.status === 'failed' && order.failureReason && (
                  <span className="inv-stamp__why"> — {order.failureReason}</span>
                )}
              </div>

              <dl className="inv-meta">
                <div>
                  <dt>Order no.</dt>
                  <dd className="inv-mono">{order.orderId}</dd>
                </div>
                <div>
                  <dt>Order date</dt>
                  <dd>{formatDateTime(order.createdAt)}</dd>
                </div>
                <div>
                  <dt>Billed to</dt>
                  <dd>
                    {order.billedTo?.name}
                    <span className="inv-doc__muted">{order.billedTo?.email}</span>
                  </dd>
                </div>
                <div>
                  <dt>Payment ID</dt>
                  <dd className="inv-mono">{order.paymentId || '—'}</dd>
                </div>
              </dl>

              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th scope="col">Description</th>
                      <th scope="col" className="inv-r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong className="inv-item">{order.course?.title || 'Program'}</strong>
                        <span className="inv-doc__muted">
                          Study plan: {formatDate(order.startDate)} → {formatDate(order.endDate)}
                          {order.course?.instructor ? ` · Mentor ${order.course.instructor}` : ''}
                        </span>
                      </td>
                      <td className="inv-r">{formatINR(order.subtotal)}</td>
                    </tr>
                    <tr>
                      <td>
                        Certificate &amp; lifetime access
                        <span className="inv-doc__muted">Included with the program</span>
                      </td>
                      <td className="inv-r">{formatINR(0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <dl className="inv-sums">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatINR(order.subtotal)}</dd>
                </div>
                <div className={order.couponCode ? 'inv-sums__discount' : ''}>
                  <dt>Coupon discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
                  <dd>{order.couponCode ? `−${formatINR(order.discount)}` : formatINR(0)}</dd>
                </div>
                <div>
                  <dt>Taxes</dt>
                  <dd>{formatINR(0)}</dd>
                </div>
                <div className="inv-sums__total">
                  <dt>{order.status === 'paid' ? 'Total paid' : 'Total due'}</dt>
                  <dd>{formatINR(order.total)}</dd>
                </div>
              </dl>

              <footer className="inv-doc__foot">
                <p>Payments are processed securely by Razorpay · {order.currency || 'INR'}. Amounts are inclusive of all taxes.</p>
                <p>Questions about this order? Write to {BRAND.email} with the order number above.</p>
              </footer>
            </article>

            <div className="inv-actions">
              <button className="edu-btn edu-btn--accent" onClick={() => window.print()}>
                Print / Save PDF
              </button>
              {order.status !== 'paid' && order.course?._id && (
                <button className="edu-btn edu-btn--ghost" onClick={() => navigate(`/payment/${order.course._id}`)}>
                  {order.status === 'failed' ? 'Try again' : 'Complete payment'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default InvoicePage;
