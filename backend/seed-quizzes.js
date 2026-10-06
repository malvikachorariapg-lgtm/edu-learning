// Seed a five-question quiz for every active course.
// Safe to run repeatedly: courses that already have an up-to-date quiz are left
// alone (so question ids stay stable for learners mid-attempt), new courses get one.
// Pass --force to regenerate every quiz.
require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./models/Course');
const Quiz = require('./models/Quiz');

const QUESTIONS_PER_QUIZ = 5;
const PASS_PERCENT = 60;
const KEYS = ['a', 'b', 'c', 'd', 'e'];

// t: question, o: options (top to bottom), c: indexes of correct options, e: explanation
const BANK = {
  finance: {
    single: [
      { t: 'Which financial statement shows a company’s assets, liabilities and equity at a point in time?', o: ['Income statement', 'Balance sheet', 'Cash flow statement', 'Statement of retained earnings'], c: [1], e: 'The balance sheet is a snapshot: assets = liabilities + equity on a given date.' },
      { t: 'What does a discounted cash flow (DCF) valuation estimate?', o: ['The book value of equity', 'The present value of expected future cash flows', 'Last year’s net profit', 'The market price of the stock today'], c: [1], e: 'A DCF discounts projected free cash flows back to today at a rate that reflects risk.' },
      { t: 'If interest rates rise, what generally happens to the price of an existing fixed-rate bond?', o: ['It rises', 'It falls', 'It stays the same', 'It becomes zero'], c: [1], e: 'New bonds pay more, so older bonds with lower coupons must trade at a discount.' },
      { t: 'What does WACC stand for?', o: ['Weighted average cost of capital', 'Working asset cash conversion', 'Ward adjusted capital charge', 'Weighted annual cash contribution'], c: [0], e: 'WACC blends the cost of debt and equity by their share of the capital structure.' },
      { t: 'In trade settlement, what does “T+1” mean?', o: ['The trade is settled one hour after execution', 'Settlement happens one business day after the trade date', 'The trade is cancelled after one day', 'One extra fee is charged'], c: [1], e: 'T+1 means cash and securities change hands one business day after the trade date.' },
      { t: 'Which ratio measures a company’s ability to pay short-term obligations?', o: ['Price-to-earnings ratio', 'Current ratio', 'Dividend yield', 'Return on equity'], c: [1], e: 'Current ratio = current assets ÷ current liabilities, a core liquidity check.' },
      { t: 'What is diversification mainly meant to reduce?', o: ['Systematic (market) risk', 'Unsystematic (company-specific) risk', 'Inflation', 'Taxes on gains'], c: [1], e: 'Holding many uncorrelated assets dilutes company-specific risk; market risk remains.' },
      { t: 'Value at Risk (VaR) at 95% over one day tells you…', o: ['The maximum possible loss', 'A loss level that should only be exceeded on about 5% of days', 'The average daily profit', 'The capital the regulator requires'], c: [1], e: 'VaR is a threshold at a confidence level, not a worst-case bound.' },
      { t: 'EBITDA excludes which of these?', o: ['Revenue', 'Cost of goods sold', 'Depreciation and amortisation', 'Operating expenses'], c: [2], e: 'EBITDA is earnings before interest, taxes, depreciation and amortisation.' }
    ],
    multi: [
      { t: 'Which of these are line items on a cash flow statement? Select all that apply.', o: ['Cash from operating activities', 'Goodwill', 'Cash from investing activities', 'Cash from financing activities'], c: [0, 2, 3], e: 'The cash flow statement has three sections: operating, investing and financing. Goodwill sits on the balance sheet.' },
      { t: 'Which of these are part of KYC (Know Your Customer) checks? Select all that apply.', o: ['Verifying identity documents', 'Guaranteeing investment returns', 'Screening against sanctions lists', 'Setting the customer’s credit card limit'], c: [0, 2], e: 'KYC verifies who the customer is and screens them for sanctions and AML risk.' },
      { t: 'Which of these increase the risk of a bond portfolio? Select all that apply.', o: ['Longer duration', 'Higher credit ratings across holdings', 'Concentration in one issuer', 'Shorter maturities'], c: [0, 2], e: 'Longer duration raises rate sensitivity and concentration raises credit risk.' }
    ]
  },
  technology: {
    single: [
      { t: 'Which HTTP method is conventionally used to create a new resource in a REST API?', o: ['GET', 'POST', 'DELETE', 'HEAD'], c: [1], e: 'POST submits a new entity to a collection; GET only reads.' },
      { t: 'What does Git’s `git pull` do?', o: ['Uploads local commits', 'Fetches remote changes and merges them into the current branch', 'Deletes the remote branch', 'Creates a new repository'], c: [1], e: '`git pull` is `git fetch` followed by a merge (or rebase).' },
      { t: 'Which data structure works on a first-in, first-out basis?', o: ['Stack', 'Queue', 'Tree', 'Hash map'], c: [1], e: 'A queue removes items in the order they were added (FIFO).' },
      { t: 'What is the time complexity of looking up a key in a well-distributed hash map?', o: ['O(1) on average', 'O(n)', 'O(log n)', 'O(n²)'], c: [0], e: 'Hashing jumps straight to a bucket, so average lookup is constant time.' },
      { t: 'In cloud computing, what does “auto scaling” do?', o: ['Encrypts data at rest', 'Adds or removes compute capacity automatically based on demand', 'Backs up databases daily', 'Shrinks images to save storage'], c: [1], e: 'Auto scaling adjusts the number of instances to match load.' },
      { t: 'Which status code means the client is not authorised to access a resource without logging in?', o: ['200', '301', '401', '500'], c: [2], e: '401 Unauthorized means authentication is required or failed.' },
      { t: 'What is a primary key in a relational database?', o: ['A column that uniquely identifies each row', 'The first column of every table', 'An encrypted password field', 'A backup of the table'], c: [0], e: 'A primary key is unique and non-null for every row.' },
      { t: 'In Python, which of these creates a list?', o: ['(1, 2, 3)', '[1, 2, 3]', '{1, 2, 3}', '<1, 2, 3>'], c: [1], e: 'Square brackets create a list; parentheses a tuple; braces a set.' },
      { t: 'What does CI in “CI/CD” stand for?', o: ['Code inspection', 'Continuous integration', 'Cloud infrastructure', 'Container isolation'], c: [1], e: 'Continuous integration builds and tests every change merged to the main branch.' }
    ],
    multi: [
      { t: 'Which of these are JavaScript frameworks or libraries for building user interfaces? Select all that apply.', o: ['React', 'Django', 'Vue', 'PostgreSQL'], c: [0, 2], e: 'React and Vue build UIs in the browser. Django is a Python web framework; PostgreSQL is a database.' },
      { t: 'Which of these are good practices for storing user passwords? Select all that apply.', o: ['Hash them with a slow algorithm such as bcrypt', 'Store them in plain text for easy recovery', 'Use a unique salt per password', 'Email them to the user after sign-up'], c: [0, 2], e: 'Slow, salted hashes make stolen password databases far harder to crack.' },
      { t: 'Which of these are managed services offered by major cloud providers? Select all that apply.', o: ['Object storage', 'Managed relational databases', 'Serverless functions', 'Desktop word processors'], c: [0, 1, 2], e: 'Object storage, managed databases and serverless compute are core cloud building blocks.' }
    ]
  },
  analytics: {
    single: [
      { t: 'Which measure of central tendency is least affected by extreme outliers?', o: ['Mean', 'Median', 'Range', 'Standard deviation'], c: [1], e: 'The median is the middle value, so a few extreme values barely move it.' },
      { t: 'Which SQL clause filters rows after aggregation?', o: ['WHERE', 'HAVING', 'ORDER BY', 'FROM'], c: [1], e: 'HAVING filters groups produced by GROUP BY; WHERE filters rows before grouping.' },
      { t: 'Which chart is best for showing how a metric changes over time?', o: ['Pie chart', 'Line chart', 'Scatter plot of two categories', 'Treemap'], c: [1], e: 'Line charts make trends across a continuous time axis easy to read.' },
      { t: 'A model performs very well on training data but poorly on new data. This is called…', o: ['Underfitting', 'Overfitting', 'Normalisation', 'Imputation'], c: [1], e: 'Overfitting means the model memorised noise in the training set.' },
      { t: 'What does a correlation coefficient of −0.9 indicate?', o: ['No relationship', 'A strong negative linear relationship', 'A weak positive relationship', 'That one variable causes the other'], c: [1], e: 'Values near −1 indicate a strong inverse linear relationship — not causation.' },
      { t: 'In Power BI or Tableau, a “measure” is typically…', o: ['A static image', 'An aggregated calculation such as total sales', 'A text label for a chart', 'A database backup'], c: [1], e: 'Measures aggregate numeric values in the current filter context.' },
      { t: 'What is the purpose of splitting data into training and test sets?', o: ['To make the dataset smaller', 'To evaluate how the model performs on unseen data', 'To remove outliers', 'To speed up SQL queries'], c: [1], e: 'A held-out test set gives an honest estimate of real-world performance.' },
      { t: 'Which SQL join returns only rows with matching keys in both tables?', o: ['LEFT JOIN', 'INNER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN'], c: [1], e: 'INNER JOIN keeps only rows whose join keys exist on both sides.' },
      { t: 'Precision in a classification model measures…', o: ['Of all predicted positives, how many were actually positive', 'Of all actual positives, how many were found', 'Overall accuracy', 'Training speed'], c: [0], e: 'Precision = true positives ÷ (true positives + false positives).' }
    ],
    multi: [
      { t: 'Which of these are common data-cleaning steps? Select all that apply.', o: ['Removing duplicate records', 'Handling missing values', 'Choosing the dashboard colour theme', 'Fixing inconsistent formats such as dates'], c: [0, 1, 3], e: 'Deduplication, missing-value handling and format standardisation are core cleaning steps.' },
      { t: 'Which of these are supervised learning algorithms? Select all that apply.', o: ['Linear regression', 'K-means clustering', 'Decision tree classifier', 'Principal component analysis'], c: [0, 2], e: 'Regression and decision trees learn from labelled data; k-means and PCA are unsupervised.' },
      { t: 'Which of these are SQL aggregate functions? Select all that apply.', o: ['SUM()', 'UPPER()', 'COUNT()', 'AVG()'], c: [0, 2, 3], e: 'SUM, COUNT and AVG aggregate many rows into one value; UPPER works row by row.' }
    ]
  },
  marketing: {
    single: [
      { t: 'What does SEO stand for?', o: ['Search engine optimisation', 'Social engagement outreach', 'Sales enablement operations', 'Sponsored email offers'], c: [0], e: 'SEO improves how a site ranks in organic search results.' },
      { t: 'Click-through rate (CTR) is calculated as…', o: ['Clicks ÷ impressions', 'Impressions ÷ clicks', 'Conversions ÷ clicks', 'Spend ÷ clicks'], c: [0], e: 'CTR = clicks ÷ impressions, usually shown as a percentage.' },
      { t: 'Which metric tells you the average cost of acquiring one paying customer?', o: ['CPM', 'CAC', 'CTR', 'NPS'], c: [1], e: 'Customer acquisition cost (CAC) = total acquisition spend ÷ new customers.' },
      { t: 'In the marketing funnel, which stage comes first?', o: ['Conversion', 'Awareness', 'Retention', 'Advocacy'], c: [1], e: 'People must first become aware of a brand before they consider or buy.' },
      { t: 'What is an A/B test used for?', o: ['Comparing two versions to see which performs better', 'Doubling the ad budget', 'Auditing brand guidelines', 'Choosing a company logo by vote'], c: [0], e: 'A/B tests split traffic between variants and compare a target metric.' },
      { t: 'A strong call to action (CTA) should be…', o: ['Vague so it fits any page', 'Specific and action-oriented', 'Hidden at the very bottom', 'Written entirely in jargon'], c: [1], e: 'Clear, specific CTAs (“Start your free trial”) convert better.' },
      { t: 'What does ROAS measure?', o: ['Revenue generated for every unit spent on ads', 'Number of followers gained', 'Average time on site', 'Email open rate'], c: [0], e: 'Return on ad spend = revenue from ads ÷ ad spend.' },
      { t: 'Which content format is usually best for explaining a complex product step by step?', o: ['A single meme', 'A how-to guide or tutorial video', 'A billboard', 'A one-word tweet'], c: [1], e: 'Tutorials give room to explain and demonstrate each step.' },
      { t: 'What is a “buyer persona”?', o: ['A fictional profile of an ideal customer based on research', 'A celebrity endorsement contract', 'The company’s brand mascot', 'A paid influencer'], c: [0], e: 'Personas summarise the goals, pains and behaviour of key customer segments.' }
    ],
    multi: [
      { t: 'Which of these are owned media channels? Select all that apply.', o: ['The company website', 'A paid search ad', 'The company email newsletter', 'A news article written by a journalist'], c: [0, 2], e: 'Owned media is controlled by the brand. Ads are paid media; press coverage is earned media.' },
      { t: 'Which of these are on-page SEO factors? Select all that apply.', o: ['Title tags', 'Meta descriptions', 'Number of office locations', 'Heading structure'], c: [0, 1, 3], e: 'Titles, meta descriptions and headings are on-page signals search engines read.' },
      { t: 'Which of these metrics measure social media engagement? Select all that apply.', o: ['Comments', 'Shares', 'Office rent', 'Company founding year'], c: [0, 1], e: 'Comments and shares show people actively interacting with content.' }
    ]
  },
  management: {
    single: [
      { t: 'What does the “critical path” in a project schedule represent?', o: ['The cheapest set of tasks', 'The longest chain of dependent tasks that sets the minimum project duration', 'Tasks assigned to the manager', 'Tasks that can be skipped'], c: [1], e: 'Any delay on the critical path delays the whole project.' },
      { t: 'In a SWOT analysis, “Threats” are…', o: ['Internal weaknesses', 'External factors that could harm the organisation', 'Competitor strengths only', 'Budget overruns'], c: [1], e: 'Opportunities and threats are external; strengths and weaknesses are internal.' },
      { t: 'What is the main purpose of a RACI matrix?', o: ['Tracking inventory', 'Clarifying who is Responsible, Accountable, Consulted and Informed', 'Calculating project cost', 'Ranking employees'], c: [1], e: 'RACI removes ambiguity about roles on each task or decision.' },
      { t: 'Just-in-time (JIT) inventory aims to…', o: ['Keep large safety stocks', 'Receive goods only as they are needed in production', 'Buy everything once a year', 'Outsource all manufacturing'], c: [1], e: 'JIT cuts holding costs by matching deliveries to production needs.' },
      { t: 'Which leadership style involves the team in decisions?', o: ['Autocratic', 'Democratic (participative)', 'Laissez-faire', 'Transactional only'], c: [1], e: 'Participative leaders seek team input before deciding.' },
      { t: 'In Scrum, how long is a sprint typically?', o: ['One day', 'One to four weeks', 'Six months', 'One year'], c: [1], e: 'Sprints are short, fixed time-boxes — usually one to four weeks.' },
      { t: 'A SMART goal is Specific, Measurable, Achievable, Relevant and…', o: ['Time-bound', 'Tactical', 'Transparent', 'Trendy'], c: [0], e: 'Time-bound goals have a clear deadline.' },
      { t: 'What is the bullwhip effect in a supply chain?', o: ['Demand swings growing larger as they move upstream', 'Faster delivery to customers', 'A pricing strategy', 'A quality inspection method'], c: [0], e: 'Small changes in consumer demand amplify into big swings for suppliers.' },
      { t: 'Which document formally authorises a project to begin?', o: ['Risk register', 'Project charter', 'Lessons learned log', 'Change request'], c: [1], e: 'The project charter names the sponsor, objectives and authority of the project manager.' }
    ],
    multi: [
      { t: 'Which of these are part of the project management “triple constraint”? Select all that apply.', o: ['Scope', 'Time', 'Office location', 'Cost'], c: [0, 1, 3], e: 'Scope, time and cost trade off against each other; quality sits in the middle.' },
      { t: 'Which of these are Scrum events? Select all that apply.', o: ['Sprint planning', 'Annual appraisal', 'Daily scrum', 'Quarterly earnings call'], c: [0, 2], e: 'Scrum events include sprint planning, daily scrum, sprint review and retrospective.' },
      { t: 'Which of these help reduce supply chain risk? Select all that apply.', o: ['Dual-sourcing critical components', 'Relying on a single supplier', 'Keeping safety stock for key items', 'Ignoring demand forecasts'], c: [0, 2], e: 'Multiple suppliers and buffer stock protect against disruptions.' }
    ]
  }
};

const CATEGORY_NOUN = {
  finance: 'finance',
  technology: 'technology',
  analytics: 'analytics',
  marketing: 'marketing',
  management: 'management'
};

// Deterministic rotation so courses in the same category get different question mixes
const rotate = (list, by) => list.map((_, i) => list[(i + by) % list.length]);

// Stable shuffle seeded by the question text, so the right answer isn't always in the same slot
const shuffleFor = (seedText, list) => {
  let seed = [...seedText].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = (seed >>> 16) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const toQuestion = (item, type) => {
  const order = shuffleFor(item.t, item.o.map((_, i) => i));
  const options = order.map((src, i) => ({ key: KEYS[i], text: item.o[src] }));
  // Correct keys are listed top to bottom, the same order the options are shown in
  const correct = order
    .map((src, i) => (item.c.includes(src) ? KEYS[i] : null))
    .filter(Boolean);
  return { text: item.t.replace(/\s*Select all that apply\.$/, ''), type, options, correct, explanation: item.e };
};

const buildQuiz = (course, indexInCategory) => {
  const bank = BANK[course.category] || BANK.technology;
  const multiCount = indexInCategory % 2 === 0 ? 1 : 2;
  const singles = rotate(bank.single, (indexInCategory * 4) % bank.single.length).slice(0, QUESTIONS_PER_QUIZ - multiCount);
  const multis = rotate(bank.multi, indexInCategory % bank.multi.length).slice(0, multiCount);

  // Spread the multi-select questions through the quiz instead of bunching them at the end
  const questions = singles.map((q) => toQuestion(q, 'single'));
  const slots = multiCount === 1 ? [1 + (indexInCategory % 3)] : [1, 3];
  multis.forEach((q, i) => questions.splice(slots[i], 0, toQuestion(q, 'multi')));

  return {
    courseId: course._id,
    title: `${course.title}: knowledge check`,
    description: `Five questions on the core ${CATEGORY_NOUN[course.category] || 'course'} ideas from this program. Score ${PASS_PERCENT}% or more to pass — you can retake it any time.`,
    passPercent: PASS_PERCENT,
    questions,
    isActive: true
  };
};

const sameQuestions = (a, b) =>
  a.length === b.length &&
  a.every((q, i) => q.text === b[i].text && q.type === b[i].type && q.correct.join() === b[i].correct.join());

const run = async () => {
  const force = process.argv.includes('--force');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/imarticus-lms');

  const courses = await Course.find({ isActive: true }).select('title category createdAt').sort({ createdAt: 1, _id: 1 }).lean();
  const seen = {};
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const course of courses) {
    const cat = course.category || 'technology';
    seen[cat] = (seen[cat] || 0);
    const quiz = buildQuiz(course, seen[cat]);
    seen[cat] += 1;

    const existing = await Quiz.findOne({ courseId: course._id }).lean();
    if (!existing) {
      await Quiz.create(quiz);
      created += 1;
    } else if (force || existing.title !== quiz.title || !sameQuestions(existing.questions, quiz.questions)) {
      await Quiz.updateOne({ _id: existing._id }, { $set: quiz });
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log(`Quizzes: ${created} created, ${updated} updated, ${unchanged} unchanged (${courses.length} active courses)`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Quiz seeding failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
