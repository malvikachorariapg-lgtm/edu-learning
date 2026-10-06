const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const { withSpan } = require('../services/telemetry');
const { logger, logEvent } = require('../services/logger');

const PHONE_RE = /^\+?[0-9 ]{10,15}$/;
const PREF_KEYS = ['courseUpdates', 'promotions', 'weeklyDigest'];

const passwordProblem = (password) => {
  if (typeof password !== 'string' || password.length < 8) return 'New password must be at least 8 characters long';
  if (password.length > 128) return 'New password is too long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'New password must contain both letters and numbers';
  return null;
};

const profileOf = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || '',
  bio: user.bio || '',
  avatarUrl: user.avatarUrl || '',
  notificationPrefs: {
    courseUpdates: user.notificationPrefs?.courseUpdates !== false,
    promotions: !!user.notificationPrefs?.promotions,
    weeklyDigest: user.notificationPrefs?.weeklyDigest !== false
  },
  createdAt: user.createdAt,
  enrolledCount: (user.enrolledCourses || []).length
});

const notFound = (res) => res.status(404).json({ success: false, message: 'We couldn’t find your account. Please log in again.' });

// GET /api/users/me — the signed-in learner's profile
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('name email role phone bio avatarUrl notificationPrefs createdAt enrolledCourses.courseId')
      .lean();
    if (!user) return notFound(res);
    res.json({ success: true, data: profileOf(user) });
  } catch (error) {
    logger.error('Profile fetch failed', { error, 'user.id': req.user.id });
    res.status(500).json({ success: false, message: 'Could not load your profile. Please try again.' });
  }
});

// PATCH /api/users/me — update name, phone, bio and notification preferences
router.patch('/me', verifyToken, async (req, res) => {
  try {
    const updates = {};
    const body = req.body || {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ success: false, message: 'Name must be between 2 and 80 characters' });
      }
      updates.name = name;
    }

    if (body.phone !== undefined) {
      const phone = String(body.phone || '').trim();
      if (phone && !PHONE_RE.test(phone)) {
        return res.status(400).json({ success: false, message: 'Enter a valid phone number, e.g. +91 98765 43210' });
      }
      updates.phone = phone;
    }

    if (body.bio !== undefined) {
      const bio = String(body.bio || '').trim();
      if (bio.length > 280) {
        return res.status(400).json({ success: false, message: 'Bio can be at most 280 characters' });
      }
      updates.bio = bio;
    }

    if (body.notificationPrefs !== undefined) {
      const prefs = body.notificationPrefs;
      if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
        return res.status(400).json({ success: false, message: 'Invalid notification preferences' });
      }
      for (const key of Object.keys(prefs)) {
        if (!PREF_KEYS.includes(key) || typeof prefs[key] !== 'boolean') {
          return res.status(400).json({ success: false, message: 'Invalid notification preferences' });
        }
        updates[`notificationPrefs.${key}`] = prefs[key];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const user = await withSpan('users.update_profile', { 'edu.fields': Object.keys(updates).join(',') }, () =>
      User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true })
        .select('name email role phone bio avatarUrl notificationPrefs createdAt enrolledCourses.courseId')
        .lean()
    );
    if (!user) return notFound(res);

    const fields = Object.keys(updates);
    const prefFields = fields.filter((f) => f.startsWith('notificationPrefs.')).map((f) => f.split('.')[1]);
    const detailFields = fields.filter((f) => !f.startsWith('notificationPrefs.'));
    if (detailFields.length) {
      logEvent('profile.updated', { 'user.id': req.user.id, 'profile.fields': detailFields });
    }
    if (prefFields.length) {
      logEvent('profile.notifications_updated', {
        'user.id': req.user.id,
        'profile.prefs': prefFields.map((k) => `${k}=${updates[`notificationPrefs.${k}`]}`)
      });
    }

    res.json({ success: true, message: 'Profile updated', data: profileOf(user) });
  } catch (error) {
    logger.error('Profile update failed', { error, 'user.id': req.user.id });
    res.status(500).json({ success: false, message: 'Could not update your profile. Please try again.' });
  }
});

// POST /api/users/me/password — change password (requires the current one)
router.post('/me/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Enter your current password and a new password' });
    }
    const weak = passwordProblem(newPassword);
    if (weak) {
      logEvent('profile.password_change_failed', { 'user.id': req.user.id, reason: 'weak' }, 'warn');
      return res.status(400).json({ success: false, message: weak });
    }

    const user = await User.findById(req.user.id).select('password');
    if (!user) return notFound(res);

    const matches = await bcrypt.compare(String(currentPassword), user.password);
    if (!matches) {
      logEvent('profile.password_change_failed', { 'user.id': req.user.id, reason: 'wrong_current' }, 'warn');
      return res.status(400).json({ success: false, message: 'Your current password is incorrect' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      logEvent('profile.password_change_failed', { 'user.id': req.user.id, reason: 'same_as_current' }, 'warn');
      return res.status(400).json({ success: false, message: 'New password must be different from your current password' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    logEvent('profile.password_changed', { 'user.id': req.user.id });
    res.json({ success: true, message: 'Password changed' });
  } catch (error) {
    logger.error('Password change failed', { error, 'user.id': req.user.id });
    res.status(500).json({ success: false, message: 'Could not change your password. Please try again.' });
  }
});

module.exports = router;
