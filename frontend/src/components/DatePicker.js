import React, { useEffect, useMemo, useState } from 'react';
import { formatKey } from '../utils/schedule';

/**
 * Month calendar for picking a date range.
 *
 * start, end: 'YYYY-MM-DD' | ''      (end may be '' while picking)
 * onChange:   ({ start, end }) => void
 * minKey / maxKey: selectable bounds (inclusive)
 *
 * First click sets the start, second click sets the end. Clicking before the
 * start while picking moves the start. All maths is on UTC date keys.
 */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const keyOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parseKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  return { y, m: m - 1 };
};
const monthLabel = (y, m) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const DatePicker = ({ start, end, onChange, minKey, maxKey }) => {
  const [view, setView] = useState(() => parseKey(start || minKey));
  const [hoverKey, setHoverKey] = useState('');

  // Follow the selection when it changes from outside (e.g. a preset)
  useEffect(() => {
    if (start) setView(parseKey(start));
  }, [start]);

  const picking = Boolean(start && !end);
  const monthIndex = (y, m) => y * 12 + m;
  const current = monthIndex(view.y, view.m);
  const minMonth = minKey ? monthIndex(parseKey(minKey).y, parseKey(minKey).m) : -Infinity;
  const maxMonth = maxKey ? monthIndex(parseKey(maxKey).y, parseKey(maxKey).m) : Infinity;

  const shift = (delta) => {
    const idx = current + delta;
    setView({ y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 });
  };

  const cells = useMemo(() => {
    const firstDow = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const out = Array.from({ length: firstDow }, () => null);
    for (let d = 1; d <= days; d++) out.push(keyOf(view.y, view.m, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const handlePick = (key) => {
    if (!start || end || key < start) {
      onChange({ start: key, end: '' });
    } else {
      onChange({ start, end: key });
      setHoverKey('');
    }
  };

  // While picking the end, preview the range up to the hovered day
  const rangeEnd = end || (picking && hoverKey > start ? hoverKey : '');

  return (
    <div className="edu-datepicker">
      <div className="edu-datepicker__head">
        <button
          type="button"
          className="edu-datepicker__nav"
          onClick={() => shift(-1)}
          disabled={current <= minMonth}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="edu-datepicker__month" aria-live="polite">{monthLabel(view.y, view.m)}</span>
        <button
          type="button"
          className="edu-datepicker__nav"
          onClick={() => shift(1)}
          disabled={current >= maxMonth}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="edu-datepicker__grid" role="grid" onMouseLeave={() => setHoverKey('')}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="edu-datepicker__dow" role="columnheader">{w}</span>
        ))}
        {cells.map((key, i) => {
          if (!key) return <span key={`blank-${i}`} className="edu-datepicker__blank" />;
          const disabled = Boolean((minKey && key < minKey) || (maxKey && key > maxKey));
          const isStart = key === start;
          const isEnd = key === end;
          const inRange = Boolean(start && rangeEnd && key > start && key < rangeEnd);
          const isPreviewEnd = !end && key === rangeEnd;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={[
                'edu-datepicker__day',
                disabled ? '' : 'is-available',
                isStart ? 'is-start' : '',
                isEnd ? 'is-end' : '',
                inRange ? 'is-in-range' : '',
                isPreviewEnd ? 'is-preview-end' : ''
              ].join(' ')}
              disabled={disabled}
              aria-selected={isStart || isEnd}
              aria-label={`${formatKey(key, { weekday: 'long', day: 'numeric', month: 'long' })}${
                isStart ? ', start date' : isEnd ? ', end date' : ''
              }`}
              onMouseEnter={() => picking && setHoverKey(key)}
              onClick={() => handlePick(key)}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="edu-datepicker__foot">
        <span className="edu-datepicker__slot">
          <span className="edu-label">Start</span>
          <strong>{start ? formatKey(start) : '—'}</strong>
        </span>
        <span className="edu-datepicker__arrow" aria-hidden="true">→</span>
        <span className={`edu-datepicker__slot${picking ? ' is-waiting' : ''}`}>
          <span className="edu-label">End</span>
          <strong>{end ? formatKey(end) : picking ? 'Pick a day' : '—'}</strong>
        </span>
      </div>
    </div>
  );
};

export default DatePicker;
