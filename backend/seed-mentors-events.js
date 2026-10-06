// Seeds the mentor directory and the live events calendar.
// Event dates are generated relative to "now", so re-run this to refresh the calendar.
// Re-seeding resets mentors, events, mentor bookings and event registrations.
//
//   node seed-mentors-events.js
require('dotenv').config();
const mongoose = require('mongoose');
const Mentor = require('./models/Mentor');
const MentorBooking = require('./models/MentorBooking');
const LiveEvent = require('./models/LiveEvent');
const EventRegistration = require('./models/EventRegistration');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/imarticus-lms';
const avatar = (n) => `https://i.pravatar.cc/300?img=${n}`;

// Day numbers: 0 Sun, 1 Mon ... 6 Sat. Times are IST.
const mentors = [
  {
    slug: 'ananya-rao',
    name: 'Ananya Rao',
    title: 'Equity research lead',
    bio: 'Ananya has spent twelve years covering consumer and financial-services stocks on the buy side and the sell side. She now leads a research desk and hires analysts every year, so she knows exactly what a strong first model, pitch or interview answer looks like. Sessions are practical: bring a model, a stock idea or a CV and leave with a list of fixes.',
    highlights: ['Reviewed 300+ analyst models', 'Hiring manager for research roles', 'CFA charterholder'],
    categories: ['finance'],
    expertise: ['Equity research', 'Valuation', 'Financial modelling', 'CFA prep'],
    topics: ['Model review', 'Stock pitch practice', 'Breaking into research', 'CFA study plan'],
    yearsExperience: 12,
    rating: 4.9,
    reviewsCount: 186,
    sessionsCount: 412,
    price: 999,
    languages: ['English', 'Hindi', 'Kannada'],
    city: 'Bengaluru',
    avatar: avatar(32),
    availability: [
      { day: 1, start: '18:00', end: '21:00' },
      { day: 3, start: '18:00', end: '21:00' },
      { day: 6, start: '10:00', end: '13:00' }
    ]
  },
  {
    slug: 'vikram-mehta',
    name: 'Vikram Mehta',
    title: 'Principal software engineer',
    bio: 'Vikram builds payment and data platforms that handle millions of requests a day, and has run more than 500 technical interviews. He is happiest walking through system design trade-offs, reviewing a portfolio project line by line, or helping you plan the jump from support or QA into engineering.',
    highlights: ['500+ interviews conducted', 'Leads a team of 14 engineers', 'Open-source maintainer'],
    categories: ['technology'],
    expertise: ['System design', 'Backend engineering', 'Python', 'Career switch'],
    topics: ['System design mock', 'Code / project review', 'Interview preparation', 'Career switch into tech'],
    yearsExperience: 14,
    rating: 4.8,
    reviewsCount: 142,
    sessionsCount: 305,
    price: 1299,
    languages: ['English', 'Hindi', 'Gujarati'],
    city: 'Pune',
    avatar: avatar(59),
    availability: [
      { day: 2, start: '19:00', end: '21:30' },
      { day: 4, start: '19:00', end: '21:30' },
      { day: 0, start: '11:00', end: '13:00' }
    ]
  },
  {
    slug: 'priya-nair',
    name: 'Priya Nair',
    title: 'Analytics manager',
    bio: 'Priya runs a marketing analytics team and started her career as a fresher analyst writing SQL all day. Her free intro calls help you figure out whether analytics is the right path, which tools to learn first, and how to build a portfolio that gets callbacks.',
    highlights: ['Free 30-minute intro calls', 'Built analytics teams from scratch', 'Mentored 200+ career switchers'],
    categories: ['analytics'],
    expertise: ['SQL', 'Excel', 'Power BI', 'Career guidance'],
    topics: ['Is analytics right for me?', 'Portfolio review', 'Learning roadmap', 'Resume review'],
    yearsExperience: 9,
    rating: 4.9,
    reviewsCount: 231,
    sessionsCount: 520,
    price: 0,
    languages: ['English', 'Malayalam', 'Tamil'],
    city: 'Kochi',
    avatar: avatar(16),
    availability: [
      { day: 1, start: '12:00', end: '14:00' },
      { day: 2, start: '12:00', end: '14:00' },
      { day: 4, start: '12:00', end: '14:00' },
      { day: 5, start: '17:00', end: '19:00' }
    ]
  },
  {
    slug: 'arjun-kapoor',
    name: 'Arjun Kapoor',
    title: 'Growth marketing head',
    bio: 'Arjun has scaled consumer apps from a few thousand to several million users using performance marketing, lifecycle campaigns and a lot of experiments. Bring a campaign, a funnel or a marketing plan and he will help you find the leak.',
    highlights: ['Managed ₹40 Cr+ in ad spend', 'Ran 1,000+ growth experiments', 'Guest lecturer at business schools'],
    categories: ['marketing'],
    expertise: ['Performance marketing', 'Growth', 'SEO', 'Brand strategy'],
    topics: ['Campaign teardown', 'Funnel review', 'Marketing career advice', 'Portfolio review'],
    yearsExperience: 11,
    rating: 4.7,
    reviewsCount: 98,
    sessionsCount: 214,
    price: 799,
    languages: ['English', 'Hindi', 'Punjabi'],
    city: 'Gurugram',
    avatar: avatar(12),
    availability: [
      { day: 3, start: '19:00', end: '21:00' },
      { day: 5, start: '19:00', end: '21:00' },
      { day: 6, start: '16:00', end: '18:00' }
    ]
  },
  {
    slug: 'meera-iyer',
    name: 'Meera Iyer',
    title: 'Director of product',
    bio: 'Meera has shipped products across fintech and B2B SaaS and now leads a group of product managers. She coaches on product sense, prioritisation and stakeholder management, and runs realistic PM mock interviews with written feedback afterwards.',
    highlights: ['Hired 40+ product managers', 'Ex-founder', 'Written feedback after every mock'],
    categories: ['management', 'technology'],
    expertise: ['Product management', 'Leadership', 'Stakeholder management', 'PM interviews'],
    topics: ['PM mock interview', 'Product sense', 'Moving into management', 'Roadmap review'],
    yearsExperience: 15,
    rating: 5.0,
    reviewsCount: 77,
    sessionsCount: 168,
    price: 1499,
    languages: ['English', 'Tamil'],
    city: 'Chennai',
    avatar: avatar(26),
    availability: [
      { day: 6, start: '09:00', end: '12:00' },
      { day: 0, start: '09:00', end: '11:00' }
    ]
  },
  {
    slug: 'rohan-desai',
    name: 'Rohan Desai',
    title: 'Investment banking director',
    bio: 'Rohan has advised on mergers, IPOs and private placements for nearly two decades. He is straightforward about what banking life is like, and his sessions focus on technical interview prep, deal case studies and how to network your way into a first role.',
    highlights: ['18 years in investment banking', '60+ closed transactions', 'Campus recruiting lead'],
    categories: ['finance', 'management'],
    expertise: ['Investment banking', 'M&A', 'Valuation', 'Interview prep'],
    topics: ['IB technical interview', 'Deal case walkthrough', 'Networking strategy', 'Career advice'],
    yearsExperience: 18,
    rating: 4.8,
    reviewsCount: 121,
    sessionsCount: 276,
    price: 1199,
    languages: ['English', 'Hindi', 'Marathi'],
    city: 'Mumbai',
    avatar: avatar(18),
    availability: [
      { day: 2, start: '20:00', end: '22:00' },
      { day: 6, start: '11:00', end: '13:00' }
    ]
  },
  {
    slug: 'sana-qureshi',
    name: 'Sana Qureshi',
    title: 'Senior data scientist',
    bio: 'Sana builds forecasting and recommendation models and loves turning messy data into something a business can act on. She helps learners with machine learning projects, statistics fundamentals and data science interviews, at a price designed for students.',
    highlights: ['Kaggle competitions expert', 'Teaches statistics on weekends', 'Student-friendly pricing'],
    categories: ['analytics', 'technology'],
    expertise: ['Machine learning', 'Python', 'Statistics', 'Data science interviews'],
    topics: ['ML project review', 'Statistics doubts', 'Data science interview prep', 'Learning roadmap'],
    yearsExperience: 7,
    rating: 4.8,
    reviewsCount: 64,
    sessionsCount: 139,
    price: 499,
    languages: ['English', 'Hindi', 'Urdu'],
    city: 'Hyderabad',
    avatar: avatar(42),
    availability: [
      { day: 1, start: '19:00', end: '21:00' },
      { day: 3, start: '07:00', end: '08:30' },
      { day: 5, start: '19:00', end: '21:00' },
      { day: 0, start: '16:00', end: '18:00' }
    ]
  },
  {
    slug: 'karthik-subramanian',
    name: 'Karthik Subramanian',
    title: 'Engineering manager',
    bio: 'Karthik moved from mechanical engineering into software and now manages a cloud infrastructure team. His free intro calls are for anyone weighing a switch into technology: he will help you pick a path, size up the effort and set a realistic 90-day plan.',
    highlights: ['Free 30-minute intro calls', 'Career switcher himself', 'Hires for cloud and DevOps roles'],
    categories: ['technology', 'management'],
    expertise: ['Cloud', 'DevOps', 'Career switch', 'Engineering management'],
    topics: ['Career switch into tech', 'Choosing a learning path', 'Cloud certifications', 'Resume review'],
    yearsExperience: 13,
    rating: 4.6,
    reviewsCount: 89,
    sessionsCount: 233,
    price: 0,
    languages: ['English', 'Tamil', 'Telugu'],
    city: 'Bengaluru',
    avatar: avatar(13),
    availability: [
      { day: 1, start: '08:00', end: '09:30' },
      { day: 3, start: '20:00', end: '21:30' },
      { day: 6, start: '15:00', end: '17:00' }
    ]
  }
];

// Build an IST instant N days from today at hh:mm
const istAt = (daysFromToday, time) => {
  const todayIst = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const d = new Date(`${todayIst}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return new Date(`${d.toISOString().slice(0, 10)}T${time}:00+05:30`);
};

const host = (slug) => {
  const m = mentors.find((x) => x.slug === slug);
  return { name: m.name, title: m.title, avatar: m.avatar };
};

const events = [
  {
    slug: 'dcf-in-60-minutes',
    title: 'Build a DCF in 60 minutes',
    summary: 'A live, follow-along build of a discounted cash flow model for a listed company.',
    description: 'We will pull real financials, forecast revenue and margins, work out a cost of capital and land on a value per share — all in one sitting. You will leave with a clean template and a feel for which assumptions actually move the answer.',
    type: 'workshop',
    host: host('ananya-rao'),
    category: 'finance',
    agenda: ['Reading the annual report fast', 'Forecasting the drivers', 'WACC without the jargon', 'Sensitivity tables'],
    startsAt: istAt(3, '19:00'),
    durationMinutes: 90,
    capacity: 120,
    registeredCount: 87,
    level: 'Intermediate'
  },
  {
    slug: 'ask-a-hiring-manager-analytics',
    title: 'AMA: Ask an analytics hiring manager',
    summary: 'Bring your questions about breaking into data analytics — CVs, portfolios, interviews.',
    description: 'An open hour with a manager who reads hundreds of analytics applications a year. Ask anything: what makes a portfolio stand out, how much SQL is enough, and how freshers can compete with experienced applicants.',
    type: 'ama',
    host: host('priya-nair'),
    category: 'analytics',
    agenda: ['Live CV teardown (volunteers)', 'Open questions', 'What we look for in take-home tasks'],
    startsAt: istAt(6, '18:30'),
    durationMinutes: 60,
    capacity: 200,
    registeredCount: 200,
    level: 'All levels'
  },
  {
    slug: 'system-design-for-beginners',
    title: 'System design for beginners',
    summary: 'Design a URL shortener from scratch and learn the vocabulary interviewers expect.',
    description: 'A gentle introduction to system design. We will design a URL shortener end to end — APIs, storage, caching and scaling — and talk through the trade-offs interviewers want to hear you reason about.',
    type: 'workshop',
    host: host('vikram-mehta'),
    category: 'technology',
    agenda: ['Requirements and estimates', 'APIs and data model', 'Caching and scaling', 'Live Q&A'],
    startsAt: istAt(9, '20:00'),
    durationMinutes: 75,
    capacity: 150,
    registeredCount: 112,
    level: 'Beginner'
  },
  {
    slug: 'performance-marketing-teardown',
    title: 'Performance marketing teardown',
    summary: 'We dissect three real ad funnels and rebuild the weakest one live.',
    description: 'From ad creative to landing page to checkout, we will walk through three funnels, spot where they leak and rebuild the weakest one together. Expect frameworks you can reuse on your own campaigns the next morning.',
    type: 'webinar',
    host: host('arjun-kapoor'),
    category: 'marketing',
    agenda: ['Anatomy of a funnel', 'Three teardowns', 'Rebuild live', 'Q&A'],
    startsAt: istAt(13, '19:30'),
    durationMinutes: 60,
    capacity: 40,
    registeredCount: 38,
    level: 'Intermediate'
  },
  {
    slug: 'first-90-days-as-a-manager',
    title: 'Your first 90 days as a manager',
    summary: 'A candid webinar on the jump from individual contributor to people manager.',
    description: 'What changes when you start managing people, how to run your first one-on-ones, and the mistakes almost every new manager makes. Includes a template for your first 90-day plan.',
    type: 'webinar',
    host: host('meera-iyer'),
    category: 'management',
    agenda: ['What actually changes', 'One-on-ones that work', 'Giving feedback', 'Your 90-day plan'],
    startsAt: istAt(18, '11:00'),
    durationMinutes: 60,
    capacity: 250,
    registeredCount: 164,
    level: 'All levels'
  },
  {
    slug: 'ml-projects-that-get-interviews',
    title: 'ML projects that get you interviews',
    summary: 'How to scope, build and present a machine learning project recruiters remember.',
    description: 'Most portfolio projects look the same. We will look at what makes one stand out — a real problem, honest evaluation, and a clear write-up — and review a few community projects live.',
    type: 'workshop',
    host: host('sana-qureshi'),
    category: 'analytics',
    agenda: ['Picking a problem', 'Evaluation that convinces', 'Writing it up', 'Live project reviews'],
    startsAt: istAt(25, '17:00'),
    durationMinutes: 90,
    capacity: 100,
    registeredCount: 41,
    level: 'Intermediate'
  },
  // Past events
  {
    slug: 'excel-for-finance-speedrun',
    title: 'Excel for finance: a speedrun',
    summary: 'Shortcuts, lookups and pivot tables every finance learner should know cold.',
    description: 'A fast-paced session covering the Excel features analysts use every day, with a practice workbook to keep.',
    type: 'workshop',
    host: host('rohan-desai'),
    category: 'finance',
    agenda: ['Keyboard-only navigation', 'Lookups', 'Pivot tables', 'Practice workbook'],
    startsAt: istAt(-9, '19:00'),
    durationMinutes: 60,
    capacity: 150,
    registeredCount: 142,
    level: 'Beginner'
  },
  {
    slug: 'breaking-into-cloud-ama',
    title: 'AMA: Breaking into cloud careers',
    summary: 'Certifications, projects and first jobs in cloud and DevOps.',
    description: 'An open Q&A on which certifications matter, what to build, and how to land a first cloud or DevOps role.',
    type: 'ama',
    host: host('karthik-subramanian'),
    category: 'technology',
    agenda: ['Certifications that matter', 'Projects to build', 'Open questions'],
    startsAt: istAt(-4, '18:00'),
    durationMinutes: 60,
    capacity: 200,
    registeredCount: 176,
    level: 'All levels'
  }
];

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    await Promise.all([
      Mentor.deleteMany({}),
      MentorBooking.deleteMany({}),
      LiveEvent.deleteMany({}),
      EventRegistration.deleteMany({})
    ]);

    await Promise.all([Mentor.syncIndexes(), MentorBooking.syncIndexes(), LiveEvent.syncIndexes(), EventRegistration.syncIndexes()]);

    const createdMentors = await Mentor.insertMany(mentors);
    const createdEvents = await LiveEvent.insertMany(events.map((e) => ({ ...e, format: 'online' })));

    console.log(`Seeded ${createdMentors.length} mentors and ${createdEvents.length} events`);
    createdEvents.forEach((e) => console.log(`  ${e.startsAt.toISOString()}  ${e.title}`));
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
