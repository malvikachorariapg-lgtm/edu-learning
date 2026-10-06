// Learning streaks: consecutive UTC days on which a learner completed at least one lesson.
const mongoose = require('mongoose');
const User = require('../models/User');
const { withSpan } = require('./telemetry');

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_DAYS = 60;
// Activity is read from secondaries; give the latest completions time to replicate
const REPLICATION_GRACE_MS = Number(process.env.ACTIVITY_REPLICATION_GRACE_MS) || 550;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const streakFromDays = (days, now = new Date()) => {
  const set = new Set(days);
  let cursor = new Date(`${dayKey(now)}T00:00:00.000Z`);
  // A streak is still alive if the last activity was yesterday
  if (!set.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
};

/**
 * Current streak for a learner, counting `extraDay` (the activity being recorded now).
 * Returns { streakDays, activeDays }.
 */
const learningStreak = (userId, extraDay = new Date()) =>
  withSpan('learning.streak', { 'enduser.id': String(userId) }, async () => {
    await wait(REPLICATION_GRACE_MS);
    const since = new Date(Date.now() - STREAK_WINDOW_DAYS * DAY_MS);
    const rows = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(String(userId)) } },
      { $unwind: '$enrolledCourses' },
      { $unwind: '$enrolledCourses.progress' },
      { $match: { 'enrolledCourses.progress.completed': true, 'enrolledCourses.progress.completedAt': { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$enrolledCourses.progress.completedAt', timezone: 'UTC' } }
        }
      }
    ]).read('secondaryPreferred');

    const days = rows.map((r) => r._id);
    if (extraDay) days.push(dayKey(extraDay));
    const unique = [...new Set(days)];
    return { streakDays: streakFromDays(unique), activeDays: unique.length };
  });

module.exports = { learningStreak, streakFromDays };
