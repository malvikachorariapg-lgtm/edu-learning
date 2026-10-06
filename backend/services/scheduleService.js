// Learner study schedule: any start date and any end date the learner likes.
// Dates are handled as 'YYYY-MM-DD' strings (UTC midnight) so the client's
// timezone can never shift a plan onto the wrong day.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_START_AHEAD_DAYS = Number(process.env.SCHEDULE_MAX_START_DAYS) || 365;
const MAX_SPAN_DAYS = Number(process.env.SCHEDULE_MAX_SPAN_DAYS) || 730;

const isDateKey = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  // toISOString() throws on an invalid date such as 2026-13-40, so check first
  !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const keyToDate = (key) => new Date(`${key}T00:00:00.000Z`);

const toKey = (date) => new Date(date).toISOString().slice(0, 10);

// Learners ahead of UTC (e.g. IST) reach "today" before the server does, so
// allow one day of slack when checking "not in the past".
const todayKey = () => new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

/**
 * Validate a requested schedule.
 * `current` (optional) is the existing { startDate, endDate } of an enrollment:
 * a start date already in the past may be kept as-is, but not moved backwards.
 * Returns { ok: true, startDate, endDate } (Date objects) or { ok: false, message }.
 */
const validateSchedule = (startKey, endKey, current = null) => {
  if (!isDateKey(startKey) || !isDateKey(endKey)) {
    return { ok: false, message: 'Pick a start date and an end date' };
  }

  const today = todayKey();
  const keepingStart = current?.startDate && toKey(current.startDate) === startKey;

  if (startKey < today && !keepingStart) {
    return { ok: false, message: 'Start date can’t be in the past' };
  }
  if (endKey < startKey) {
    return { ok: false, message: 'End date must be on or after the start date' };
  }
  if (endKey < today) {
    return { ok: false, message: 'End date can’t be in the past' };
  }

  const aheadDays = (keyToDate(startKey) - keyToDate(today)) / DAY_MS;
  if (aheadDays > MAX_START_AHEAD_DAYS) {
    return { ok: false, message: 'Start date must be within the next 12 months' };
  }
  const spanDays = (keyToDate(endKey) - keyToDate(startKey)) / DAY_MS + 1;
  if (spanDays > MAX_SPAN_DAYS) {
    return { ok: false, message: 'Plans can run for up to two years' };
  }

  return { ok: true, startDate: keyToDate(startKey), endDate: keyToDate(endKey) };
};

module.exports = { validateSchedule, isDateKey, keyToDate, toKey };
