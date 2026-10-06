import React, { useEffect, useState } from 'react';
import { getPublicCoupons } from '../services/commerceApi';
import { toast } from './Toaster';
import './PromoBar.css';

const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch (e) {
    return false;
  }
};

/**
 * Thin offers strip listing the public promo codes.
 * onApply(code): when given (checkout), clicking a code applies it; otherwise it is copied.
 * appliedCode: highlights the code currently applied at checkout.
 */
const PromoBar = ({ onApply, appliedCode, className = '' }) => {
  const [coupons, setCoupons] = useState([]);

  useEffect(() => {
    let alive = true;
    getPublicCoupons()
      .then((res) => { if (alive) setCoupons(res.data?.data || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!coupons.length) return null;

  const handleClick = async (code) => {
    if (onApply) {
      onApply(code);
      return;
    }
    const ok = await copyText(code);
    if (ok) toast.success(`${code} copied — paste it at checkout`);
    else toast.info(`Use code ${code} at checkout`);
  };

  return (
    <div className={`promo-bar ${className}`.trim()} role="region" aria-label="Current offers">
      <div className="edu-container promo-bar__inner">
        <span className="promo-bar__label">
          <span className="promo-bar__dot" aria-hidden="true" />
          Offers
        </span>
        <ul className="promo-bar__list">
          {coupons.map((c) => {
            const isOn = appliedCode && appliedCode === c.code;
            return (
              <li key={c.code}>
                <button
                  type="button"
                  className={`promo-bar__code${isOn ? ' is-on' : ''}`}
                  onClick={() => handleClick(c.code)}
                  title={c.description}
                  aria-label={`${c.code}, ${c.headline}. ${onApply ? 'Apply code' : 'Copy code'}`}
                  disabled={isOn}
                >
                  <strong>{c.code}</strong>
                  <span className="promo-bar__sep" aria-hidden="true">·</span>
                  <span>{c.headline}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <span className="promo-bar__hint">{onApply ? 'Tap a code to apply' : 'Tap a code to copy'}</span>
      </div>
    </div>
  );
};

export default PromoBar;
