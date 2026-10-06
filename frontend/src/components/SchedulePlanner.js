import React from 'react';
import DatePicker from './DatePicker';
import {
  PRESETS,
  addDays,
  estimateHours,
  localTodayKey,
  paceFor,
  suggestedDays
} from '../utils/schedule';

/**
 * "Plan your pace": pick any start + end date and see the daily effort it takes.
 *
 * course:   course object (uses .duration for the effort estimate)
 * value:    { start, end } date keys
 * onChange: ({ start, end }) => void
 * minStart: earliest selectable start (defaults to today)
 */
const SchedulePlanner = ({ course, value, onChange, minStart }) => {
  const today = localTodayKey();
  const minKey = minStart && minStart < today ? minStart : today;
  // Mirror the server limits: start within 12 months, plans up to two years.
  // While the end is being picked, allow up to two years after the start.
  const pickingEnd = Boolean(value.start && !value.end);
  const maxKey = pickingEnd ? addDays(value.start, 729) : addDays(today, 365);

  const totalHours = estimateHours(course);
  const suggested = suggestedDays(course);
  const pace = paceFor(totalHours, value.start, value.end);

  const presets = [{ key: 'suggested', label: 'Suggested', days: suggested }, ...PRESETS];
  // Every preset matching the range lights up (e.g. "Suggested" and "3 months"
  // are the same 91 days for a 3-month program)
  const isActive = (p) => Boolean(value.start && value.end && addDays(value.start, p.days - 1) === value.end);

  const applyPreset = (days) => {
    const start = value.start && value.start >= minKey ? value.start : today;
    onChange({ start, end: addDays(start, days - 1) });
  };

  // Intensity meter: 0 at nothing, full at 10+ hrs/day
  const meter = pace ? Math.min(100, Math.max(4, (pace.hoursPerDay / 10) * 100)) : 0;

  return (
    <div className="edu-planner">
      <div className="edu-planner__presets" role="group" aria-label="Quick plans">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`edu-planner__preset${isActive(p) ? ' is-active' : ''}`}
            aria-pressed={isActive(p)}
            onClick={() => applyPreset(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DatePicker
        start={value.start}
        end={value.end}
        onChange={onChange}
        minKey={minKey}
        maxKey={maxKey}
      />

      <div className={`edu-pace${pace ? ` edu-pace--${pace.level}` : ' is-empty'}`} aria-live="polite">
        {pace ? (
          <>
            <div className="edu-pace__top">
              <span className="edu-pace__title">{pace.title}</span>
              <span className="edu-label">{pace.days} {pace.days === 1 ? 'day' : 'days'}</span>
            </div>
            <p className="edu-pace__figure">
              {pace.perDayLabel.replace(/ a day$/, '')}<small> / day</small>
            </p>
            <div className="edu-pace__meter" aria-hidden="true">
              <span style={{ width: `${meter}%` }} />
            </div>
            <p className="edu-pace__note">
              This program is about <strong>{totalHours} hours</strong> of focused study.
              Finishing in {pace.days} {pace.days === 1 ? 'day' : 'days'} means roughly {pace.perDayLabel} ({pace.perWeekLabel}). {pace.note}
            </p>
          </>
        ) : (
          <p className="edu-pace__note">
            Pick a start and an end date — finish in a week or take a few months. We’ll tell you how many
            hours a day it takes. This program is about <strong>{totalHours} hours</strong> of focused study.
          </p>
        )}
      </div>
    </div>
  );
};

export default SchedulePlanner;
