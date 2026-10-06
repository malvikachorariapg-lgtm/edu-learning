import api from './api';

// ---- Mentors -------------------------------------------------------------
export const getMentors = (params = {}) => api.get('/mentors', { params });
export const getMentor = (idOrSlug) => api.get(`/mentors/${idOrSlug}`);
export const getMentorSlots = (idOrSlug, date, config) =>
  api.get(`/mentors/${idOrSlug}/slots`, { params: { date }, ...config });
export const bookMentor = (idOrSlug, payload, config) =>
  api.post(`/mentors/${idOrSlug}/bookings`, payload, config);
export const getMyMentorBookings = () => api.get('/mentors/bookings/me');
export const cancelMentorBooking = (bookingId) => api.post(`/mentors/bookings/${bookingId}/cancel`);

// ---- Live events ---------------------------------------------------------
export const getEvents = (params = {}) => api.get('/events', { params });
export const getEvent = (idOrSlug) => api.get(`/events/${idOrSlug}`);
export const registerForEvent = (idOrSlug) => api.post(`/events/${idOrSlug}/register`);
export const cancelEventRegistration = (idOrSlug) => api.delete(`/events/${idOrSlug}/register`);
export const getMyEventRegistrations = () => api.get('/events/registrations/me');

// ---- Formatting (everything is shown in IST) ----------------------------
export const IST = 'Asia/Kolkata';

const fmt = (opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts });
const weekdayShort = fmt({ weekday: 'short' });
const dayNum = fmt({ day: 'numeric' });
const monthShort = fmt({ month: 'short' });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const mediumDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' });

// A YYYY-MM-DD calendar date (IST) as a Date at IST midday, safe for formatting
const fromDateKey = (key) => new Date(`${key}T12:00:00+05:30`);

export const istDateKey = (date = new Date()) =>
  new Date(new Date(date).getTime() + 330 * 60000).toISOString().slice(0, 10);

export const addDaysToKey = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const formatDateKey = (key, style = 'long') =>
  (style === 'long' ? longDate : mediumDate).format(fromDateKey(key));

export const dateKeyParts = (key) => {
  const d = fromDateKey(key);
  return { weekday: weekdayShort.format(d), day: dayNum.format(d), month: monthShort.format(d) };
};


// "18:30" → "6:30 PM"
export const formatSlot = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

// IST wall-clock time of an instant, e.g. "7:00 PM"
export const formatTime = (date) =>
  formatSlot(new Date(new Date(date).getTime() + 330 * 60000).toISOString().slice(11, 16));

export const formatDateTime = (date) => `${mediumDate.format(new Date(date))} · ${formatTime(date)} IST`;

export const dateParts = (date) => {
  const d = new Date(date);
  return { weekday: weekdayShort.format(d), day: dayNum.format(d), month: monthShort.format(d) };
};

export const formatPrice = (price) =>
  price > 0 ? `₹${Number(price).toLocaleString('en-IN')}` : 'Free';

export const CATEGORY_LABELS = {
  finance: 'Finance',
  technology: 'Technology',
  analytics: 'Analytics',
  marketing: 'Marketing',
  management: 'Management'
};

export const EVENT_TYPE_LABELS = { workshop: 'Workshop', ama: 'AMA', webinar: 'Webinar' };

// Google Calendar "add event" link
export const googleCalendarUrl = ({ title, details, start, end }) => {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: details || '',
    dates: `${stamp(start)}/${stamp(end)}`,
    ctz: IST
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// Downloadable .ics file contents
export const icsFile = ({ uid, title, details, start, end }) => {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Edu Learning//Sessions//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@edulearning.in`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(details)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
};

export const downloadIcs = (event, filename = 'session.ics') => {
  const blob = new Blob([icsFile(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const currentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    return null;
  }
};
