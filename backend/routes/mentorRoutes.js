const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Mentor = require('../models/Mentor');
const MentorBooking = require('../models/MentorBooking');
const { verifyToken, getUserFromRequest } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

// All mentor availability is published in IST (UTC+05:30, no DST)
const IST_OFFSET_MS = 330 * 60 * 1000;
const BOOKING_WINDOW_DAYS = 21;
const CANCEL_CUTOFF_HOURS = 12;
const CATEGORIES = ['finance', 'technology', 'analytics', 'marketing', 'management'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const istToday = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const isRealDate = (dateStr) => {
  if (!DATE_RE.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
};

const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
const istInstant = (dateStr, time) => new Date(`${dateStr}T${time}:00+05:30`);
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Bookable dates: today (IST) through the end of the booking window
const bookingWindow = () => {
  const first = istToday();
  return { first, last: addDays(first, BOOKING_WINDOW_DAYS - 1) };
};

// Start times a mentor offers on a given IST date, from the weekly template
const slotTimesFor = (mentor, dateStr) => {
  const step = mentor.sessionMinutes || 30;
  const day = weekdayOf(dateStr);
  const times = [];
  (mentor.availability || [])
    .filter((w) => w.day === day)
    .forEach((w) => {
      for (let t = toMinutes(w.start); t + step <= toMinutes(w.end); t += step) {
        times.push(fromMinutes(t));
      }
    });
  return [...new Set(times)].sort();
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findMentor = (idOrSlug, projection) => {
  const key = String(idOrSlug || '').trim();
  const query = mongoose.Types.ObjectId.isValid(key) && key.length === 24
    ? { _id: key, isActive: true }
    : { slug: key.toLowerCase(), isActive: true };
  return Mentor.findOne(query, projection).lean();
};

const PUBLIC_FIELDS = '-__v -createdAt -updatedAt -isActive';

// Upcoming confirmed bookings for a set of mentors, keyed "mentorId|date|time"
const takenSlots = async (mentorIds, first, last) => {
  const rows = await MentorBooking.find(
    { mentor: { $in: mentorIds }, status: 'confirmed', date: { $gte: first, $lte: last } },
    'mentor date time user'
  ).lean();
  const taken = new Map();
  rows.forEach((b) => taken.set(`${b.mentor}|${b.date}|${b.time}`, String(b.user)));
  return taken;
};

const nextOpenSlot = (mentor, taken, first) => {
  const now = Date.now();
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i += 1) {
    const date = addDays(first, i);
    for (const time of slotTimesFor(mentor, date)) {
      if (istInstant(date, time).getTime() <= now) continue;
      if (taken.has(`${mentor._id}|${date}|${time}`)) continue;
      return { date, time, startsAt: istInstant(date, time) };
    }
  }
  return null;
};

const bookingReference = () =>
  `MS-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const shapeBooking = (b) => {
  const startsAt = new Date(b.startsAt);
  const endsAt = new Date(startsAt.getTime() + (b.durationMinutes || 30) * 60000);
  const hoursToStart = (startsAt.getTime() - Date.now()) / 36e5;
  return {
    ...b,
    endsAt,
    timezone: 'Asia/Kolkata',
    isUpcoming: b.status === 'confirmed' && endsAt.getTime() > Date.now(),
    canCancel: b.status === 'confirmed' && hoursToStart > CANCEL_CUTOFF_HOURS
  };
};

// ---------------------------------------------------------------------------
// GET /api/mentors — directory with filters
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { expertise, q, sort = 'recommended' } = req.query;
    const filter = { isActive: true };

    if (expertise && expertise !== 'all') {
      const key = String(expertise).trim().toLowerCase();
      filter.$or = CATEGORIES.includes(key)
        ? [{ categories: key }]
        : [{ expertise: { $regex: `^${escapeRegex(key)}$`, $options: 'i' } }];
    }

    if (q && String(q).trim()) {
      const rx = { $regex: escapeRegex(String(q).trim().slice(0, 80)), $options: 'i' };
      const textMatch = [{ name: rx }, { title: rx }, { bio: rx }, { expertise: rx }, { topics: rx }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: textMatch }];
        delete filter.$or;
      } else {
        filter.$or = textMatch;
      }
    }

    const sorts = {
      recommended: { rating: -1, sessionsCount: -1 },
      rating: { rating: -1, reviewsCount: -1 },
      'price-asc': { price: 1, rating: -1 },
      'price-desc': { price: -1, rating: -1 },
      experience: { yearsExperience: -1, rating: -1 }
    };
    if (!sorts[sort]) {
      return res.status(400).json({ success: false, message: 'Unknown sort option' });
    }

    const mentors = await Mentor.find(filter, PUBLIC_FIELDS).sort(sorts[sort]).lean();

    const { first, last } = bookingWindow();
    const taken = await takenSlots(mentors.map((m) => m._id), first, last);
    const data = mentors.map((m) => ({ ...m, nextAvailable: nextOpenSlot(m, taken, first) }));

    logEvent('mentor.listed', {
      'filter.expertise': expertise || 'all', 'filter.query': q ? String(q).trim().slice(0, 80) : undefined,
      'filter.sort': sort, 'result.count': data.length, 'enduser.id': getUserFromRequest(req)?.id
    });

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    logger.error('List mentors failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load mentors right now' });
  }
});

// ---------------------------------------------------------------------------
// Learner's own bookings (declared before /:id so "bookings" isn't read as an id)
// ---------------------------------------------------------------------------
router.get('/bookings/me', verifyToken, async (req, res) => {
  try {
    const rows = await MentorBooking.find({ user: req.user.id }, '-__v')
      .populate('mentor', 'name slug title avatar price languages')
      .sort({ startsAt: 1 })
      .lean();
    res.json({ success: true, data: rows.map(shapeBooking) });
  } catch (error) {
    logger.error('My bookings failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load your sessions' });
  }
});

router.post('/bookings/:bookingId/cancel', verifyToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    const booking = await MentorBooking.findOne({ _id: bookingId, user: req.user.id }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This session is already cancelled' });
    }

    const msToStart = new Date(booking.startsAt).getTime() - Date.now();
    if (msToStart <= 0) {
      logEvent('mentor.cancel_rejected', { 'booking.id': bookingId, 'enduser.id': req.user.id, 'cancel.reason': 'already_started' }, 'warn');
      return res.status(400).json({ success: false, message: 'This session has already started, so it can’t be cancelled' });
    }
    if (msToStart <= CANCEL_CUTOFF_HOURS * 36e5) {
      logEvent('mentor.cancel_rejected', {
        'booking.id': bookingId, 'mentor.id': String(booking.mentor), 'enduser.id': req.user.id,
        'cancel.reason': 'inside_cutoff', 'booking.hours_to_start': Math.round((msToStart / 36e5) * 10) / 10
      }, 'warn');
      return res.status(400).json({
        success: false,
        message: `Sessions can only be cancelled more than ${CANCEL_CUTOFF_HOURS} hours before they start. Please contact support if you can’t make it.`
      });
    }

    const updated = await MentorBooking.findOneAndUpdate(
      { _id: bookingId, user: req.user.id, status: 'confirmed' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true, lean: true }
    ).populate('mentor', 'name slug title avatar price languages');

    if (!updated) {
      return res.status(400).json({ success: false, message: 'This session is already cancelled' });
    }

    await Mentor.updateOne({ _id: booking.mentor, sessionsCount: { $gt: 0 } }, { $inc: { sessionsCount: -1 } });
    logEvent('mentor.session_cancelled', {
      'booking.id': bookingId, 'mentor.id': String(booking.mentor), 'enduser.id': req.user.id,
      'booking.date': booking.date, 'booking.time': booking.time, 'booking.hours_to_start': Math.round(msToStart / 36e5)
    });
    res.json({ success: true, message: 'Session cancelled. The slot is free for others now.', data: shapeBooking(updated) });
  } catch (error) {
    logger.error('Cancel booking failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not cancel the session right now' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mentors/:id — profile
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const mentor = await findMentor(req.params.id, PUBLIC_FIELDS);
    if (!mentor) {
      return res.status(404).json({ success: false, message: 'Mentor not found' });
    }

    const { first, last } = bookingWindow();
    const taken = await takenSlots([mentor._id], first, last);
    const now = Date.now();

    // Per-day summary for the date strip
    const days = [];
    for (let i = 0; i < BOOKING_WINDOW_DAYS; i += 1) {
      const date = addDays(first, i);
      const times = slotTimesFor(mentor, date);
      const open = times.filter(
        (t) => istInstant(date, t).getTime() > now && !taken.has(`${mentor._id}|${date}|${t}`)
      ).length;
      days.push({ date, weekday: weekdayOf(date), total: times.length, open });
    }

    res.json({
      success: true,
      data: {
        ...mentor,
        timezone: 'Asia/Kolkata',
        bookingWindowDays: BOOKING_WINDOW_DAYS,
        cancelCutoffHours: CANCEL_CUTOFF_HOURS,
        days,
        nextAvailable: nextOpenSlot(mentor, taken, first)
      }
    });
  } catch (error) {
    logger.error('Mentor detail failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load this mentor right now' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mentors/:id/slots?date=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/:id/slots', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    if (!isRealDate(date)) {
      return res.status(400).json({ success: false, message: 'Please pick a valid date (YYYY-MM-DD)' });
    }

    const mentor = await findMentor(req.params.id, 'availability sessionMinutes name');
    if (!mentor) {
      return res.status(404).json({ success: false, message: 'Mentor not found' });
    }

    const { first, last } = bookingWindow();
    if (date < first || date > last) {
      return res.status(400).json({
        success: false,
        message: `Sessions can be booked up to ${BOOKING_WINDOW_DAYS} days ahead. Please pick a date between ${first} and ${last}.`
      });
    }

    const viewer = getUserFromRequest(req);
    const taken = await takenSlots([mentor._id], date, date);
    const now = Date.now();
    const slots = slotTimesFor(mentor, date).map((time) => {
      const startsAt = istInstant(date, time);
      const bookedBy = taken.get(`${mentor._id}|${date}|${time}`);
      let status = 'open';
      if (bookedBy) status = viewer && viewer.id === bookedBy ? 'yours' : 'booked';
      else if (startsAt.getTime() <= now) status = 'past';
      return { time, startsAt, status, available: status === 'open' };
    });

    logEvent('mentor.slots_viewed', {
      'mentor.id': String(mentor._id), 'slots.date': date, 'slots.total': slots.length,
      'slots.available': slots.filter((s) => s.available).length, 'enduser.id': viewer?.id
    });

    res.json({
      success: true,
      data: { date, timezone: 'Asia/Kolkata', sessionMinutes: mentor.sessionMinutes || 30, slots }
    });
  } catch (error) {
    logger.error('Mentor slots failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load open slots right now' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/mentors/:id/bookings — book a slot
// ---------------------------------------------------------------------------
router.post('/:id/bookings', verifyToken, async (req, res) => {
  const date = String(req.body?.date || '').trim();
  const time = String(req.body?.time || '').trim();
  const topic = String(req.body?.topic || '').trim();
  const notes = String(req.body?.notes || '').trim();

  try {
    if (!isRealDate(date) || !TIME_RE.test(time)) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'invalid_slot_format' }, 'warn');
      return res.status(400).json({ success: false, message: 'Please choose a date and time slot' });
    }
    if (!topic) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'missing_topic' }, 'warn');
      return res.status(400).json({ success: false, message: 'Please choose what you’d like to talk about' });
    }
    if (topic.length > 120) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'topic_too_long' }, 'warn');
      return res.status(400).json({ success: false, message: 'Topic is too long (120 characters max)' });
    }
    if (notes.length > 1000) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'notes_too_long' }, 'warn');
      return res.status(400).json({ success: false, message: 'Notes are too long (1,000 characters max)' });
    }

    const mentor = await findMentor(req.params.id, 'availability sessionMinutes name price topics');
    if (!mentor) {
      return res.status(404).json({ success: false, message: 'Mentor not found' });
    }

    const { first, last } = bookingWindow();
    if (date < first || date > last) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'outside_window' }, 'warn');
      return res.status(400).json({
        success: false,
        message: `Sessions can be booked up to ${BOOKING_WINDOW_DAYS} days ahead`
      });
    }
    if (!slotTimesFor(mentor, date).includes(time)) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'not_in_availability' }, 'warn');
      return res.status(400).json({ success: false, message: `${mentor.name} isn’t available at that time` });
    }

    const startsAt = istInstant(date, time);
    if (startsAt.getTime() <= Date.now()) {
      logEvent('mentor.booking_rejected', { 'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'reject.reason': 'slot_in_past' }, 'warn');
      return res.status(400).json({ success: false, message: 'That slot has already passed. Please pick a later time.' });
    }

    const booking = await withSpan('mentor.booking.create', { 'mentor.id': String(mentor._id), 'booking.date': date }, () =>
      MentorBooking.create({
        mentor: mentor._id,
        user: req.user.id,
        date,
        time,
        startsAt,
        durationMinutes: mentor.sessionMinutes || 30,
        topic,
        notes,
        price: mentor.price || 0,
        reference: bookingReference()
      })
    );

    await Mentor.updateOne({ _id: mentor._id }, { $inc: { sessionsCount: 1 } });
    logEvent('mentor.session_booked', {
      'booking.id': String(booking._id), 'booking.reference': booking.reference, 'mentor.id': String(mentor._id),
      'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time, 'booking.price': mentor.price || 0, 'booking.topic': topic
    });

    const saved = await MentorBooking.findById(booking._id, '-__v')
      .populate('mentor', 'name slug title avatar price languages')
      .lean();

    res.status(201).json({
      success: true,
      message: `You’re booked with ${mentor.name}`,
      data: shapeBooking(saved)
    });
  } catch (error) {
    if (error && error.code === 11000) {
      const sameUser = /uniq_user_start/.test(error.message || '');
      logEvent('mentor.booking_conflict', {
        'mentor.id': req.params.id, 'enduser.id': req.user.id, 'booking.date': date, 'booking.time': time,
        'conflict.index': sameUser ? 'uniq_user_start' : 'uniq_confirmed_slot', 'conflict.reason': sameUser ? 'learner_overlap' : 'slot_taken'
      }, 'warn');
      return res.status(409).json({
        success: false,
        message: sameUser
          ? 'You already have a session booked at that time'
          : 'That slot was just taken. Please pick another time.'
      });
    }
    logger.error('Create booking failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not book the session right now' });
  }
});

module.exports = router;
