const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const LiveEvent = require('../models/LiveEvent');
const EventRegistration = require('../models/EventRegistration');
const { verifyToken } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const CATEGORIES = ['finance', 'technology', 'analytics', 'marketing', 'management'];
const PUBLIC_FIELDS = '-__v -createdAt -updatedAt -isActive';

const endsAtOf = (e) => new Date(new Date(e.startsAt).getTime() + e.durationMinutes * 60000);

const shapeEvent = (e, now = Date.now()) => {
  const startsAt = new Date(e.startsAt).getTime();
  const endsAt = endsAtOf(e);
  let status = 'upcoming';
  if (endsAt.getTime() <= now) status = 'past';
  else if (startsAt <= now) status = 'live';
  return {
    ...e,
    endsAt,
    status,
    seatsLeft: Math.max(0, e.capacity - e.registeredCount),
    isFull: e.registeredCount >= e.capacity,
    registrationOpen: startsAt > now
  };
};

const findEvent = (idOrSlug) => {
  const key = String(idOrSlug || '').trim();
  const query = mongoose.Types.ObjectId.isValid(key) && key.length === 24
    ? { _id: key, isActive: true }
    : { slug: key.toLowerCase(), isActive: true };
  return LiveEvent.findOne(query, PUBLIC_FIELDS).lean();
};

// ---------------------------------------------------------------------------
// GET /api/events?when=upcoming|past&category=
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const when = String(req.query.when || 'upcoming').toLowerCase();
    const category = String(req.query.category || 'all').toLowerCase();

    if (!['upcoming', 'past'].includes(when)) {
      return res.status(400).json({ success: false, message: 'when must be "upcoming" or "past"' });
    }
    if (category !== 'all' && !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Unknown category' });
    }

    const filter = { isActive: true };
    if (category !== 'all') filter.category = category;

    const now = Date.now();
    const events = await LiveEvent.find(filter, PUBLIC_FIELDS)
      .sort({ startsAt: when === 'upcoming' ? 1 : -1 })
      .lean();

    // "Upcoming" includes sessions that are live right now; "past" means finished
    const data = events
      .map((e) => shapeEvent(e, now))
      .filter((e) => (when === 'past' ? e.status === 'past' : e.status !== 'past'));

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    logger.error('List events failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load events right now' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/events/registrations/me
// ---------------------------------------------------------------------------
router.get('/registrations/me', verifyToken, async (req, res) => {
  try {
    const rows = await EventRegistration.find({ user: req.user.id }, '-__v')
      .populate('event', PUBLIC_FIELDS)
      .sort({ registeredAt: -1 })
      .lean();
    const now = Date.now();
    const data = rows
      .filter((r) => r.event)
      .map((r) => ({ ...r, event: shapeEvent(r.event, now) }))
      .sort((a, b) => new Date(a.event.startsAt) - new Date(b.event.startsAt));
    res.json({ success: true, data });
  } catch (error) {
    logger.error('My registrations failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load your event registrations' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    res.json({ success: true, data: shapeEvent(event) });
  } catch (error) {
    logger.error('Event detail failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not load this event right now' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/events/:id/register
// ---------------------------------------------------------------------------
router.post('/:id/register', verifyToken, async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (new Date(event.startsAt).getTime() <= Date.now()) {
      logEvent('event.registration_closed', { 'event.id': String(event._id), 'event.slug': event.slug, 'enduser.id': req.user.id }, 'warn');
      return res.status(400).json({ success: false, message: 'Registration has closed for this event' });
    }

    const existing = await EventRegistration.findOne({ event: event._id, user: req.user.id }).lean();
    if (existing && existing.status === 'registered') {
      logEvent('event.duplicate_registration', { 'event.id': String(event._id), 'enduser.id': req.user.id }, 'warn');
      return res.status(409).json({ success: false, message: 'You’re already registered for this event' });
    }

    // Claim a seat atomically: only succeeds while seats remain
    const claimed = await withSpan('event.seat.claim', { 'event.id': String(event._id) }, () =>
      LiveEvent.findOneAndUpdate(
        {
          _id: event._id,
          startsAt: { $gt: new Date() },
          $expr: { $lt: ['$registeredCount', '$capacity'] }
        },
        { $inc: { registeredCount: 1 } },
        { new: true, lean: true, projection: PUBLIC_FIELDS }
      )
    );
    if (!claimed) {
      logEvent('event.full', { 'event.id': String(event._id), 'event.slug': event.slug, 'event.capacity': event.capacity, 'event.seats_left': 0, 'enduser.id': req.user.id }, 'warn');
      return res.status(409).json({ success: false, message: 'Sorry, this event is full' });
    }

    // Record the registration; if another request for the same learner won the race, give the seat back
    let registration;
    try {
      if (existing) {
        registration = await EventRegistration.findOneAndUpdate(
          { _id: existing._id, status: 'cancelled' },
          { $set: { status: 'registered', registeredAt: new Date() }, $unset: { cancelledAt: 1 } },
          { new: true, lean: true }
        );
      } else {
        registration = (await EventRegistration.create({ event: event._id, user: req.user.id })).toObject();
      }
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      registration = null;
    }

    if (!registration) {
      await LiveEvent.updateOne({ _id: event._id, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
      return res.status(409).json({ success: false, message: 'You’re already registered for this event' });
    }

    logEvent('event.registered', {
      'event.id': String(event._id), 'event.slug': event.slug, 'event.category': event.category, 'enduser.id': req.user.id,
      'event.seats_left': Math.max(0, claimed.capacity - claimed.registeredCount), 'registration.reactivated': Boolean(existing)
    });

    res.status(201).json({
      success: true,
      message: 'You’re registered. We’ll email the joining link before it starts.',
      data: { ...registration, event: shapeEvent(claimed) }
    });
  } catch (error) {
    logger.error('Event register failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not register right now' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id/register — cancel registration
// ---------------------------------------------------------------------------
router.delete('/:id/register', verifyToken, async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (new Date(event.startsAt).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'This event has already started, so the registration can’t be cancelled' });
    }

    const registration = await EventRegistration.findOneAndUpdate(
      { event: event._id, user: req.user.id, status: 'registered' },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true, lean: true }
    );
    if (!registration) {
      return res.status(404).json({ success: false, message: 'You’re not registered for this event' });
    }

    const updated = await LiveEvent.findOneAndUpdate(
      { _id: event._id, registeredCount: { $gt: 0 } },
      { $inc: { registrations: -1 } },
      { new: true, lean: true, projection: PUBLIC_FIELDS }
    );

    logEvent('event.registration_cancelled', {
      'event.id': String(event._id), 'event.slug': event.slug, 'enduser.id': req.user.id,
      'event.seats_left': updated ? Math.max(0, updated.capacity - updated.registeredCount) : undefined
    });

    res.json({
      success: true,
      message: 'Registration cancelled. Your seat has been released.',
      data: { ...registration, event: shapeEvent(updated || event) }
    });
  } catch (error) {
    logger.error('Event cancel failed', { error, 'enduser.id': req.user?.id, 'http.route': req.baseUrl + req.route?.path });
    res.status(500).json({ success: false, message: 'Could not cancel the registration right now' });
  }
});

module.exports = router;
