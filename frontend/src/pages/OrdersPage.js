import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { learnerNav } from '../components/learnerNav';
import PromoBar from '../components/PromoBar';
import { getOrders, formatINR, ORDER_STATUS } from '../services/commerceApi';
import './OrdersPage.css';

const PAGE_SIZE = 5;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' }
];

const formatDate = (d, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString('en-GB', opts) : '—';

const formatTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

// Compact page list: 1 … 4 5 6 … 12
const pageList = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
};

const StatusTag = ({ status }) => {
  const meta = ORDER_STATUS[status] || { label: status, tone: 'soft' };
  return <span className={`ord-status ord-status--${meta.tone}`}>{meta.label}</span>;
};

const OrdersPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1);
  const status = FILTERS.some((f) => f.key === params.get('status')) ? params.get('status') : 'all';

  const [state, setState] = useState({ loading: true, error: '', data: [], totalPages: 1, total: 0, counts: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await getOrders({ page, limit: PAGE_SIZE, status });
      const body = res.data;
      setState({
        loading: false,
        error: '',
        data: body.data || [],
        totalPages: body.totalPages || 1,
        total: body.total || 0,
        counts: body.counts || null
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: 'We couldn’t load your orders.' }));
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const go = (next) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === undefined || (k === 'page' && v === 1) || (k === 'status' && v === 'all')) p.delete(k);
      else p.set(k, String(v));
    });
    setParams(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { loading, error, data, totalPages, total, counts } = state;

  return (
    <AppShell
      nav={learnerNav('orders')}
      eyebrow="Billing"
      title="Orders"
      actions={
        <button className="edu-btn edu-btn--ghost edu-btn--sm ord-top-btn" onClick={() => navigate('/courses')}>
          Browse programs
        </button>
      }
    >
      <div className="ord">
        <PromoBar className="ord-promo" />

        <header className="ord-head">
          <div>
            <p className="edu-label edu-label--accent">Purchase history</p>
            <h2 className="edu-h2 ord-head__title">Your <em>orders</em></h2>
            <p className="ord-head__sub">
              Every checkout you start is listed here — paid, pending or failed. Open any order for a printable invoice.
            </p>
          </div>
        </header>

        <div className="ord-filters" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={status === f.key}
              className={`ord-filter${status === f.key ? ' is-on' : ''}`}
              onClick={() => go({ status: f.key, page: 1 })}
            >
              {f.label}
              {counts && <span className="ord-filter__n">{counts[f.key] ?? 0}</span>}
            </button>
          ))}
        </div>

        {loading && !data.length ? (
          <div className="edu-loading ord-loading">
            <div className="edu-spinner" role="status" aria-label="Loading orders" />
            <p className="edu-label">Fetching orders</p>
          </div>
        ) : error ? (
          <div className="edu-empty ord-empty">
            <h3 className="edu-h3">{error}</h3>
            <p className="edu-muted">Check your connection and try again.</p>
            <button className="edu-btn edu-btn--sm" onClick={load}>Retry</button>
          </div>
        ) : !data.length && total > 0 ? (
          <div className="edu-empty ord-empty">
            <h3 className="edu-h3">That page is <em>empty.</em></h3>
            <p className="edu-muted">You have {total} {total === 1 ? 'order' : 'orders'} across {totalPages} {totalPages === 1 ? 'page' : 'pages'}.</p>
            <button className="edu-btn edu-btn--sm" onClick={() => go({ page: 1 })}>Back to page 1</button>
          </div>
        ) : !data.length ? (
          <div className="edu-empty ord-empty">
            <h3 className="edu-h3">
              {status === 'all' ? <>No orders <em>yet.</em></> : <>Nothing {FILTERS.find((f) => f.key === status).label.toLowerCase()} here.</>}
            </h3>
            <p className="edu-muted">
              {status === 'all'
                ? 'When you check out a program, the order shows up here with its invoice.'
                : 'Try another filter to see the rest of your orders.'}
            </p>
            {status === 'all' ? (
              <button className="edu-btn edu-btn--accent edu-btn--sm" onClick={() => navigate('/courses')}>
                Browse programs →
              </button>
            ) : (
              <button className="edu-btn edu-btn--ghost edu-btn--sm" onClick={() => go({ status: 'all', page: 1 })}>
                Show all orders
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={`ord-list${loading ? ' is-loading' : ''}`} aria-busy={loading}>
              <div className="ord-row ord-row--head" aria-hidden="true">
                <span>Program</span>
                <span>Date</span>
                <span>Coupon</span>
                <span className="ord-num">Amount</span>
                <span>Status</span>
                <span />
              </div>
              {data.map((o) => (
                <article className="ord-row" key={o.id}>
                  <div className="ord-cell ord-cell--course">
                    <p className="ord-course">{o.course?.title || 'Program no longer available'}</p>
                    <p className="ord-meta">Order {o.orderId}</p>
                  </div>
                  <div className="ord-cell" data-label="Date">
                    <span>{formatDate(o.createdAt)}</span>
                    <span className="ord-meta">{formatTime(o.createdAt)}</span>
                  </div>
                  <div className="ord-cell" data-label="Coupon">
                    {o.couponCode ? (
                      <span className="ord-coupon">{o.couponCode}</span>
                    ) : (
                      <span className="ord-meta">—</span>
                    )}
                  </div>
                  <div className="ord-cell ord-num" data-label="Amount">
                    <strong className="ord-amount">{formatINR(o.total)}</strong>
                    {o.discount > 0 && <span className="ord-meta ord-strike">{formatINR(o.subtotal)}</span>}
                  </div>
                  <div className="ord-cell" data-label="Status">
                    <StatusTag status={o.status} />
                  </div>
                  <div className="ord-cell ord-cell--actions">
                    <Link className="edu-btn edu-btn--ghost edu-btn--sm" to={`/orders/${encodeURIComponent(o.orderId)}`}>
                      View invoice
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <nav className="ord-pager" aria-label="Orders pages">
              <p className="ord-pager__info">
                Page {page} of {totalPages} · {total} {total === 1 ? 'order' : 'orders'}
              </p>
              <div className="ord-pager__btns">
                <button
                  type="button"
                  className="ord-page ord-page--step"
                  onClick={() => go({ page: page - 1 })}
                  disabled={page <= 1 || loading}
                >
                  ← Prev
                </button>
                {pageList(page, totalPages).map((p) =>
                  typeof p === 'string' ? (
                    <span key={p} className="ord-page ord-page--gap" aria-hidden="true">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`ord-page${p === page ? ' is-on' : ''}`}
                      aria-current={p === page ? 'page' : undefined}
                      onClick={() => go({ page: p })}
                      disabled={loading}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="ord-page ord-page--step"
                  onClick={() => go({ page: page + 1 })}
                  disabled={page >= totalPages || loading}
                >
                  Next →
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default OrdersPage;
