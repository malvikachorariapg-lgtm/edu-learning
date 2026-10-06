// Seed checkout promo codes. Safe to run repeatedly: codes are upserted and
// usage counters are left alone for codes that already exist.
require('dotenv').config();
const mongoose = require('mongoose');
const Coupon = require('./models/Coupon');

const DAY = 24 * 60 * 60 * 1000;

const startOfWeek = (d) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
};

const buildCoupons = (now = new Date()) => {
  const weekStart = startOfWeek(now);
  // The flash sale is promoted weekly; keep the code live for the whole campaign
  const campaignEnd = new Date(weekStart.getTime() + 26 * 7 * DAY - 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const yearOut = new Date(now.getTime() + 365 * DAY);

  return [
    {
      code: 'EDU20',
      type: 'percent',
      value: 20,
      maxDiscount: 600,
      minOrder: 0,
      validFrom: new Date(now.getTime() - 30 * DAY),
      validUntil: yearOut,
      usageLimit: 0,
      headline: '20% off',
      description: '20% off any program (up to ₹600)',
      featured: true
    },
    {
      code: 'FLASH12',
      type: 'percent',
      value: 12.5,
      minOrder: 0,
      validFrom: weekStart,
      validUntil: campaignEnd,
      usageLimit: 0,
      headline: '12.5% off this week',
      description: 'Flash sale: 12.5% off, this week only',
      featured: true
    },
    {
      code: 'WELCOME100',
      type: 'flat',
      value: 100,
      minOrder: 1000,
      validFrom: new Date(now.getTime() - 30 * DAY),
      validUntil: yearOut,
      usageLimit: 0,
      headline: '₹100 off',
      description: '₹100 off your first program (min. order ₹1,000)',
      featured: true
    },
    {
      code: 'STUDENT15',
      type: 'percent',
      value: 15,
      minOrder: 0,
      validFrom: new Date(now.getTime() - 30 * DAY),
      validUntil: yearOut,
      usageLimit: 1000,
      headline: '15% off',
      description: 'Student offer: 15% off',
      featured: false
    },
    {
      code: 'EXPIRED50',
      type: 'percent',
      value: 50,
      minOrder: 0,
      validFrom: lastMonth,
      validUntil: lastMonthEnd,
      usageLimit: 0,
      headline: '50% off',
      description: 'Last month’s mega sale: 50% off',
      featured: false
    },
    {
      code: 'EARLYBIRD',
      type: 'percent',
      value: 30,
      maxDiscount: 900,
      minOrder: 0,
      validFrom: new Date(now.getTime() - 60 * DAY),
      validUntil: yearOut,
      usageLimit: 50,
      usedCount: 50,
      headline: '30% off',
      description: 'Early-bird: 30% off for the first 50 learners',
      featured: false
    }
  ];
};

async function seedCoupons() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/imarticus-lms');
  const coupons = buildCoupons();

  for (const c of coupons) {
    const { usedCount, ...fields } = c;
    await Coupon.updateOne(
      { code: c.code },
      { $set: { ...fields, active: true }, $setOnInsert: { usedCount: usedCount || 0 } },
      { upsert: true }
    );
    console.log(`  ✓ ${c.code}`);
  }

  console.log(`Seeded ${coupons.length} coupons`);
  await mongoose.disconnect();
}

seedCoupons().catch((err) => {
  console.error('Coupon seed failed:', err);
  process.exit(1);
});
