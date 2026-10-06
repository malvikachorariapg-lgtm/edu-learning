// Study-plan helpers: date keys, effort estimates and pace labels.
// Dates are 'YYYY-MM-DD' keys handled in UTC so a timezone can't shift a day.

const DAY_MS = 24 * 60 * 60 * 1000;

// Programs are designed around ~7 focused hours a week (the "6–8 hrs / week" promise)
export const HOURS_PER_WEEK = 7;
const DEFAULT_WEEKS = 8;

export const toKey = (date) => new Date(date).toISOString().slice(0, 10);

// Today in the learner's own timezone, as a key
export const localTodayKey = () => {
  const d = new Date();
  return toKey(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

export const addDays = (key, n) => toKey(new Date(`${key}T00:00:00Z`).getTime() + n * DAY_MS);

export const daysInclusive = (startKey, endKey) =>
  Math.round((new Date(`${endKey}T00:00:00Z`) - new Date(`${startKey}T00:00:00Z`)) / DAY_MS) + 1;

export const formatKey = (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  key ? new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }) : '';

// "4 Months" -> 17.3 weeks, "2 Years" -> 104, "12 Weeks" -> 12, "10 days" -> 1.4
export const programWeeks = (duration) => {
  const m = String(duration || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(year|month|week|day)/);
  if (!m) return DEFAULT_WEEKS;
  const n = parseFloat(m[1]);
  const perUnit = { year: 52, month: 52 / 12, week: 1, day: 1 / 7 }[m[2]];
  return Math.max(1, n * perUnit);
};

// Total focused study hours a program needs, rounded to a friendly number
export const estimateHours = (course) => {
  const raw = programWeeks(course?.duration) * HOURS_PER_WEEK;
  return raw >= 50 ? Math.round(raw / 5) * 5 : Math.round(raw);
};

// The program's designed length in days — used for the "Suggested" preset
export const suggestedDays = (course) => Math.round(programWeeks(course?.duration) * 7);

const fmtHours = (h) => {
  if (h >= 10) return `${Math.round(h)}`;
  if (h >= 0.95) return h.toFixed(1).replace(/\.0$/, '');
  const mins = Math.max(5, Math.round((h * 60) / 5) * 5);
  return `${mins} min`;
};

/**
 * Pace for a plan: how much daily effort the chosen window needs.
 * Returns { days, hoursPerDay, perDayLabel, perWeekLabel, level, title, note }
 */
export const paceFor = (totalHours, startKey, endKey) => {
  if (!startKey || !endKey || endKey < startKey) return null;
  const days = daysInclusive(startKey, endKey);
  const hoursPerDay = totalHours / days;
  const perDay = fmtHours(hoursPerDay);
  const perDayLabel = perDay.endsWith('min') ? `${perDay} a day` : `${perDay} ${perDay === '1' ? 'hr' : 'hrs'} a day`;
  const perWeekLabel = `${fmtHours(Math.min(hoursPerDay * 7, totalHours))} hrs a week`;

  let level;
  let title;
  let note;
  if (hoursPerDay > 10) {
    level = 'extreme';
    title = 'Superhuman mode';
    note = 'That’s more than a full-time job. Possible in a sprint — but consider a slightly longer window.';
  } else if (hoursPerDay > 6) {
    level = 'intense';
    title = 'Very ambitious';
    note = 'Bootcamp intensity. Block your calendar and protect your sleep.';
  } else if (hoursPerDay > 3) {
    level = 'ambitious';
    title = 'Nice, ambitious learner';
    note = 'A serious daily commitment — very doable if this is your main focus.';
  } else if (hoursPerDay >= 1) {
    level = 'steady';
    title = 'Steady pace';
    note = 'Fits around a job or college. Consistency beats intensity.';
  } else {
    level = 'relaxed';
    title = 'Relaxed pace';
    note = 'Plenty of breathing room. Set a daily reminder so momentum doesn’t fade.';
  }

  return { days, hoursPerDay, perDayLabel, perWeekLabel, level, title, note };
};

export const PRESETS = [
  { key: 'w1', label: '1 week', days: 7 },
  { key: 'w2', label: '2 weeks', days: 14 },
  { key: 'm1', label: '1 month', days: 30 },
  { key: 'm3', label: '3 months', days: 91 }
];
