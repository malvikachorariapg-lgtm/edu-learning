const express = require('express');
const router = express.Router();
const NewsletterSubscriber = require('../models/NewsletterSubscriber');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Subscribe to the weekly newsletter
router.post('/subscribe', async (req, res) => {
  try {
    const { emailAddress, source } = req.body;

    if (!emailAddress) {
      return res.status(400).json({ success: false, message: 'emailAddress is required' });
    }
    if (!EMAIL_RE.test(String(emailAddress).trim())) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }

    await NewsletterSubscriber.updateOne(
      { email: String(emailAddress).trim().toLowerCase() },
      { $setOnInsert: { source: source || 'footer' } },
      { upsert: true }
    );

    res.status(201).json({ success: true, message: 'You’re subscribed. See you on Sunday.' });
  } catch (error) {
    console.error('Newsletter subscribe error:', error);
    res.status(500).json({ success: false, message: 'Could not subscribe right now' });
  }
});

module.exports = router;
