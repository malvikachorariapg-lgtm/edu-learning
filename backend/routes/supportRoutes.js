const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const { verifyToken, getUserFromRequest } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const { TOPICS } = SupportTicket;

const bad = (res, message) => res.status(400).json({ success: false, message });
const clean = (v) => String(v == null ? '' : v).trim();

const newTicketNumber = () => `SUP-${crypto.randomInt(100000, 1000000)}`;

const summaryOf = (t) => ({
  id: t._id,
  number: t.number,
  topic: t.topic,
  subject: t.subject,
  orderId: t.orderId || '',
  status: t.status,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  messageCount: (t.messages || []).length,
  lastMessageAt: (t.messages || []).length ? t.messages[t.messages.length - 1].createdAt : t.createdAt
});

const detailOf = (t) => ({
  ...summaryOf(t),
  name: t.name,
  email: t.email,
  messages: (t.messages || []).map((m) => ({
    id: m._id,
    from: m.from,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.createdAt
  }))
});

const findOwnTicket = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ success: false, message: 'Ticket not found' });
    return null;
  }
  const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user.id });
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found' });
    return null;
  }
  return ticket;
};

// POST /api/support/tickets — signed-in learners or guests (with name + email)
router.post('/tickets', async (req, res) => {
  try {
    const body = req.body || {};
    const topic = clean(body.topic);
    const subject = clean(body.subject);
    const message = clean(body.message);
    const orderId = clean(body.orderId);

    if (!TOPICS.includes(topic)) return bad(res, 'Please choose a topic');
    if (subject.length < 5 || subject.length > 120) return bad(res, 'Subject must be between 5 and 120 characters');
    if (message.length < 20 || message.length > 2000) return bad(res, 'Message must be between 20 and 2000 characters');
    if (orderId.length > 64) return bad(res, 'Order ID looks too long');

    let name;
    let email;
    let userId = null;
    const tokenUser = getUserFromRequest(req);
    if (tokenUser) {
      const user = await User.findById(tokenUser.id).select('name email').lean();
      if (!user) return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
      userId = user._id;
      name = user.name;
      email = user.email;
    } else {
      name = clean(body.name);
      email = clean(body.email).toLowerCase();
      if (name.length < 2 || name.length > 80) return bad(res, 'Please tell us your name (2–80 characters)');
      if (!EMAIL_RE.test(email)) return bad(res, 'Please enter a valid email address so we can reply');
    }

    const ticket = await withSpan('support.create_ticket', { 'edu.topic': topic, 'edu.guest': !userId }, async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await SupportTicket.create({
            number: newTicketNumber(),
            user: userId,
            name,
            email,
            topic,
            subject,
            orderId: orderId || undefined,
            messages: [{ from: 'customer', authorName: name, body: message }]
          });
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
      throw new Error('Could not allocate a ticket number');
    });

    logEvent('support.ticket_created', {
      'ticket.number': ticket.number,
      'ticket.topic': topic,
      'ticket.guest': !userId,
      'ticket.has_order': !!orderId,
      'user.id': userId ? String(userId) : undefined
    });

    res.status(201).json({
      success: true,
      message: `Ticket ${ticket.number} created`,
      data: detailOf(ticket)
    });
  } catch (error) {
    logger.error('Support ticket creation failed', { error });
    res.status(500).json({ success: false, message: 'Could not send your message. Please try again.' });
  }
});

// GET /api/support/tickets — own tickets, newest first
router.get('/tickets', verifyToken, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data: tickets.map(summaryOf) });
  } catch (error) {
    logger.error('Support ticket list failed', { error, 'user.id': req.user.id });
    res.status(500).json({ success: false, message: 'Could not load your tickets. Please try again.' });
  }
});

// GET /api/support/tickets/:id — one of your tickets with the conversation
router.get('/tickets/:id', verifyToken, async (req, res) => {
  try {
    const ticket = await findOwnTicket(req, res);
    if (!ticket) return;
    res.json({ success: true, data: detailOf(ticket) });
  } catch (error) {
    logger.error('Support ticket fetch failed', { error, 'user.id': req.user.id, 'ticket.id': req.params.id });
    res.status(500).json({ success: false, message: 'Could not load this ticket. Please try again.' });
  }
});

// POST /api/support/tickets/:id/replies — add a message to your ticket
router.post('/tickets/:id/replies', verifyToken, async (req, res) => {
  try {
    const message = clean((req.body || {}).message);
    if (message.length < 2 || message.length > 2000) return bad(res, 'Reply must be between 2 and 2000 characters');

    const ticket = await findOwnTicket(req, res);
    if (!ticket) return;

    ticket.messages.push({ from: 'customer', authorName: ticket.name, body: message });
    // A new message on a resolved ticket puts it back in the queue
    if (ticket.status === 'resolved') ticket.status = 'open';
    const reopened = ticket.isModified('status');
    await ticket.save();
    logEvent('support.reply_added', {
      'ticket.number': ticket.number,
      'ticket.status': ticket.status,
      'ticket.reopened': reopened,
      'ticket.messages': ticket.messages.length,
      'user.id': req.user.id
    });

    res.status(201).json({ success: true, message: 'Reply sent', data: detailOf(ticket) });
  } catch (error) {
    logger.error('Support reply failed', { error, 'user.id': req.user.id, 'ticket.id': req.params.id });
    res.status(500).json({ success: false, message: 'Could not send your reply. Please try again.' });
  }
});

module.exports = router;
