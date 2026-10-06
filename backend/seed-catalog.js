// Catalog seeder: adds new programs, fills out syllabi of existing ones, and seeds learner reviews.
// Safe to re-run: courses are matched by title, modules/lessons by title, reviews by (course, reviewer).
// Existing course, module and lesson ids are never changed, so enrollments and progress survive.
//
//   node seed-catalog.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Course = require('./models/Course');
const User = require('./models/User');
const Review = require('./models/Review');
const { connectRedis, invalidateCourseCache, disconnectRedis } = require('./config/redis');

const VIDEO_IDS = [
  'bPWmcPGdMn4', 'hBUQ8x1WlAY', 'wkA_fK_-TlM', 'MItFKhLKA18',
  'VkjUvAmHMiE', 'AEWfYNZsPbg', '6OdXHObIJgo', 'OEd2WPYuO-I'
];
const VIDEO_URLS = VIDEO_IDS.map((id) => `https://www.youtube.com/watch?v=${id}`);
let videoCursor = 0;
const nextVideo = () => VIDEO_URLS[videoCursor++ % VIDEO_URLS.length];

const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

// [moduleTitle, moduleDescription, [[lessonTitle, 'mm:ss'], ...]]
const M = (title, description, lessons) => ({ title, description, lessons });

// ---------------------------------------------------------------------------
// Existing programs: metadata + syllabus to make sure is present
// ---------------------------------------------------------------------------
const EXISTING = {
  'Full Stack Web Development Bootcamp': {
    level: 'Beginner',
    highlights: ['Ship three portfolio apps end to end', 'Weekly code reviews with a working engineer', 'Deploy to the cloud from week four', 'Capstone reviewed by a hiring panel'],
    skills: ['HTML & CSS', 'JavaScript', 'React', 'Node.js', 'Express', 'MongoDB'],
    modules: [
      M('HTML & CSS Fundamentals', 'Semantic markup, layout and responsive styling.', [['HTML Basics', '15:30'], ['CSS Styling', '20:45'], ['Flexbox & Grid Layouts', '22:10'], ['Responsive Design in Practice', '18:40']]),
      M('JavaScript & React', 'Modern JavaScript and component-driven UIs.', [['JavaScript Essentials', '26:15'], ['Working with the DOM', '19:50'], ['React Components & Props', '24:30'], ['State, Effects & Hooks', '27:05']]),
      M('Node, Express & MongoDB', 'Build and deploy a REST API backed by MongoDB.', [['Node.js and npm', '17:20'], ['Building REST APIs with Express', '28:40'], ['Modelling Data in MongoDB', '23:15'], ['Auth with JWT and Deployment', '31:00']])
    ]
  },
  'Data Science with Python': {
    level: 'Intermediate',
    highlights: ['Hands-on notebooks for every lesson', 'Real datasets from retail and finance', 'Model evaluation clinic every fortnight', 'Capstone: an end-to-end prediction project'],
    skills: ['NumPy', 'Pandas', 'Matplotlib', 'Scikit-learn', 'Feature engineering'],
    modules: [
      M('Python for Data Science', 'The language features and libraries data work relies on.', [['Python Basics', '25:00'], ['NumPy Arrays and Vectorisation', '21:30'], ['Pandas DataFrames', '27:45'], ['Cleaning Messy Data', '24:10']]),
      M('Visualisation & Machine Learning', 'Explore, explain and model your data.', [['Exploratory Data Analysis', '23:20'], ['Charts with Matplotlib & Seaborn', '19:40'], ['Regression and Classification', '29:15'], ['Evaluating Models', '22:05']])
    ]
  },
  'Cloud Computing with AWS': {
    level: 'Intermediate',
    highlights: ['Guided labs in a sandbox AWS account', 'Mapped to the Solutions Architect Associate exam', 'Cost-control checklist you can reuse at work', 'Two full-length practice tests'],
    skills: ['EC2', 'S3', 'IAM', 'Lambda', 'RDS', 'VPC networking'],
    modules: [
      M('AWS Fundamentals', 'Core services, accounts and security basics.', [['Introduction to AWS', '18:30'], ['IAM Users, Roles & Policies', '21:15'], ['EC2 Instances Hands-on', '24:40']]),
      M('Storage, Databases & Serverless', 'Choose the right building blocks for an application.', [['S3 Storage Classes', '17:55'], ['RDS and DynamoDB', '23:30'], ['Serverless with Lambda', '20:20'], ['VPC Networking Essentials', '26:10']]),
      M('Architecture & Exam Prep', 'Design well-architected systems and prepare for certification.', [['The Well-Architected Framework', '19:45'], ['High Availability Patterns', '22:00'], ['Exam Strategy and Practice Questions', '28:30']])
    ]
  },
  'Investment Banking Operations Professional': {
    level: 'Beginner',
    highlights: ['Built with practitioners from global banks', 'Trade lifecycle simulations', 'Interview preparation for operations roles', 'Placement support after completion'],
    skills: ['Trade lifecycle', 'Settlements', 'Corporate actions', 'Reconciliation', 'KYC & AML'],
    modules: [
      M('Investment Banking Basics', 'How banks, markets and products fit together.', [['Introduction to IB', '30:00'], ['Capital Markets Overview', '24:15'], ['Equity and Debt Instruments', '26:40']]),
      M('Trade Lifecycle & Operations', 'From trade capture to settlement and beyond.', [['Trade Capture and Confirmation', '22:30'], ['Clearing and Settlement', '25:10'], ['Corporate Actions', '19:45'], ['Reconciliations and Breaks', '21:20']]),
      M('Risk, Compliance & Careers', 'The controls around operations and how to get hired.', [['KYC and Anti-Money Laundering', '23:05'], ['Operational Risk in Practice', '20:35'], ['Cracking the Operations Interview', '18:50']])
    ]
  },
  'Financial Modeling & Valuation': {
    level: 'Advanced',
    highlights: ['Build a three-statement model from scratch', 'DCF, comps and LBO templates you keep', 'Model review sessions with a CFA charterholder', 'Case study: valuing a listed Indian company'],
    skills: ['Excel modelling', 'DCF valuation', 'Comparable companies', 'LBO modelling', 'M&A analysis'],
    modules: [
      M('Financial Modeling Fundamentals', 'Excel discipline and the three statements.', [['Excel for Finance', '28:00'], ['Linking the Three Statements', '31:20'], ['Forecasting Revenue and Costs', '26:45']]),
      M('Valuation Techniques', 'Value a business three different ways.', [['Discounted Cash Flow Valuation', '33:10'], ['Trading and Transaction Comps', '24:30'], ['Building an LBO Model', '35:00']]),
      M('M&A and Presenting Your Work', 'Accretion/dilution and turning a model into a recommendation.', [['Accretion and Dilution Analysis', '27:40'], ['Sensitivity Tables and Scenarios', '21:15'], ['Writing the Investment Memo', '19:30']])
    ]
  },
  'Risk Management & Compliance': {
    level: 'Intermediate',
    highlights: ['Aligned with FRM Part I topics', 'Basel framework explained with Indian bank examples', 'Hands-on VaR calculations', 'Compliance case files from real enforcement actions'],
    skills: ['Credit risk', 'Market risk', 'Operational risk', 'Value at Risk', 'Basel III'],
    modules: [
      M('Risk Management Basics', 'The vocabulary and frameworks of risk.', [['Types of Risk', '22:00'], ['Risk Appetite and Governance', '19:25'], ['The Basel Accords', '25:40']]),
      M('Measuring Risk', 'Quantify credit, market and operational exposures.', [['Credit Risk: PD, LGD and EAD', '27:15'], ['Market Risk and Value at Risk', '29:30'], ['Stress Testing', '21:50'], ['Operational Risk Events', '18:35']]),
      M('Regulatory Compliance', 'Stay on the right side of regulators.', [['RBI and SEBI Regulations', '23:20'], ['Building a Compliance Programme', '20:10'], ['Case Studies in Compliance Failures', '24:45']])
    ]
  },
  'Business Analytics with Power BI': {
    level: 'Beginner',
    highlights: ['Build five dashboards from real business data', 'DAX patterns cheat-sheet', 'Publishing and sharing in Power BI Service', 'Portfolio-ready final dashboard'],
    skills: ['Power BI Desktop', 'Power Query', 'DAX', 'Data modelling', 'Dashboard design'],
    modules: [
      M('Power BI Fundamentals', 'Load, shape and model data.', [['Getting Started with Power BI', '20:00'], ['Power Query Transformations', '23:45'], ['Star Schema Data Models', '21:30']]),
      M('DAX and Dashboard Design', 'Calculations and visuals that answer business questions.', [['DAX Measures vs Calculated Columns', '25:20'], ['Time Intelligence in DAX', '22:40'], ['Designing Effective Dashboards', '19:15'], ['Publishing and Row-Level Security', '18:30']])
    ]
  },
  'Data Analytics with SQL & Tableau': {
    level: 'Beginner',
    highlights: ['Query a production-sized sample database', 'Weekly analysis challenges', 'Tableau Public portfolio by the end', 'Mentor feedback on every dashboard'],
    skills: ['SQL', 'Joins & aggregations', 'Window functions', 'Tableau', 'Data storytelling'],
    modules: [
      M('SQL Fundamentals', 'Ask questions of relational data.', [['Introduction to SQL', '25:00'], ['Filtering, Sorting and Aggregating', '21:40'], ['Joins Explained', '24:25'], ['Window Functions', '26:50']]),
      M('Visual Analytics with Tableau', 'Turn query results into decisions.', [['Connecting Tableau to Data', '17:35'], ['Calculated Fields and LODs', '23:10'], ['Building Interactive Dashboards', '25:45'], ['Storytelling with Data', '18:20']])
    ]
  },
  'Predictive Analytics & Machine Learning': {
    level: 'Advanced',
    highlights: ['Kaggle-style project every module', 'Model interpretability with SHAP', 'Deploy a model as an API', 'One-on-one capstone review'],
    skills: ['Supervised learning', 'Model tuning', 'Ensemble methods', 'Time-series forecasting', 'Model deployment'],
    modules: [
      M('Introduction to ML', 'How machines learn from data.', [['What is Machine Learning', '30:00'], ['The Bias–Variance Trade-off', '22:15'], ['Cross-Validation and Metrics', '24:50']]),
      M('Predictive Modelling', 'Algorithms that work in production.', [['Decision Trees and Random Forests', '27:30'], ['Gradient Boosting with XGBoost', '29:10'], ['Hyperparameter Tuning', '21:40']]),
      M('Forecasting & Deployment', 'Predict the future and ship it.', [['Time-Series Forecasting', '28:20'], ['Explaining Models with SHAP', '20:45'], ['Serving a Model as an API', '23:55']])
    ]
  },
  'Digital Marketing Masterclass': {
    level: 'All levels',
    highlights: ['Run a live campaign with a real budget', 'Google and Meta certification prep', 'Templates for audits and reporting', 'Guest sessions with agency leads'],
    skills: ['SEO', 'Google Ads', 'Email marketing', 'Social media', 'Google Analytics 4'],
    modules: [
      M('Digital Marketing Fundamentals', 'Channels, funnels and planning.', [['Introduction to Digital Marketing', '22:00'], ['Customer Journeys and Funnels', '18:45'], ['Building a Channel Plan', '20:30']]),
      M('Search, Social & Email', 'Get found, get followed, get opened.', [['SEO Foundations', '26:15'], ['Search Ads that Convert', '23:40'], ['Social Media Playbooks', '21:05'], ['Email Marketing Automation', '19:50']]),
      M('Measurement', 'Know what is working.', [['Google Analytics 4 Setup', '24:20'], ['Attribution Basics', '18:10'], ['Reporting to Stakeholders', '16:45']])
    ]
  },
  'Content Marketing & Copywriting': {
    level: 'Beginner',
    highlights: ['Write every week, get line-by-line edits', 'Swipe file of 100+ proven headlines', 'Content calendar template', 'Publish three portfolio pieces'],
    skills: ['Copywriting', 'Content strategy', 'Storytelling', 'SEO writing', 'Editing'],
    modules: [
      M('Content Marketing Basics', 'Why content works and how to plan it.', [['What is Content Marketing', '18:00'], ['Audience Research and Personas', '20:25'], ['Planning a Content Calendar', '17:40']]),
      M('Copywriting Craft', 'Words that get read and acted on.', [['Headlines that Earn the Click', '19:30'], ['Writing Persuasive Landing Pages', '24:15'], ['Storytelling Frameworks', '21:50'], ['Editing Your Own Work', '16:20']])
    ]
  },
  'Social Media Marketing & Advertising': {
    level: 'Intermediate',
    highlights: ['Plan and launch paid campaigns on Meta and LinkedIn', 'Creative testing framework', 'Community management playbook', 'Monthly reporting template'],
    skills: ['Meta Ads Manager', 'LinkedIn Ads', 'Content calendars', 'Influencer marketing', 'Social analytics'],
    modules: [
      M('Social Media Strategy', 'Pick platforms and define a voice.', [['Social Media Platforms Overview', '20:00'], ['Defining Your Brand Voice', '17:15'], ['Organic Content that Travels', '22:30']]),
      M('Paid Social Advertising', 'Spend money well on social.', [['Meta Ads Manager Walkthrough', '26:40'], ['Audiences and Targeting', '21:10'], ['Creative Testing at Scale', '19:55'], ['LinkedIn Ads for B2B', '23:25']])
    ]
  },
  'Project Management Professional (PMP)': {
    level: 'Intermediate',
    highlights: ['35 contact hours for the PMP application', 'Full-length mock exams', 'Agile and hybrid approaches covered', 'Study plan tailored to your exam date'],
    skills: ['Scope management', 'Scheduling', 'Risk management', 'Stakeholder management', 'Agile delivery'],
    modules: [
      M('Project Management Fundamentals', 'Lifecycles, roles and the PMBOK view.', [['Introduction to PM', '25:00'], ['Project Lifecycles and Phases', '21:35'], ['The Project Charter', '18:50']]),
      M('Planning & Delivery', 'Scope, schedule, cost and risk.', [['Work Breakdown Structures', '22:15'], ['Critical Path Scheduling', '26:30'], ['Earned Value Management', '24:45'], ['Managing Project Risks', '20:05']]),
      M('Agile & Exam Readiness', 'Hybrid delivery and passing the exam.', [['Agile and Hybrid Approaches', '23:40'], ['Leading Project Teams', '19:20'], ['PMP Exam Strategy', '27:10']])
    ]
  },
  'Strategic Management & Leadership': {
    level: 'Advanced',
    highlights: ['Harvard-style case discussions', '360° leadership self-assessment', 'Strategy toolkit you can use on Monday', 'Small cohort for real discussion'],
    skills: ['Competitive strategy', 'Leadership', 'Decision making', 'Change management', 'OKRs'],
    modules: [
      M('Leadership Fundamentals', 'Know yourself, lead others.', [['What Makes a Great Leader', '28:00'], ['Leadership Styles', '21:20'], ['Giving and Receiving Feedback', '19:45']]),
      M('Strategy in Practice', 'Analyse markets and choose where to play.', [['Industry Analysis with Five Forces', '24:30'], ['Competitive Advantage', '22:55'], ['Setting OKRs that Matter', '18:40'], ['Leading Organisational Change', '25:15']])
    ]
  },
  'Operations & Supply Chain Management': {
    level: 'Intermediate',
    highlights: ['Simulations of real supply chain disruptions', 'Inventory models in spreadsheets', 'Lean and Six Sigma toolkit', 'Plant and warehouse case studies'],
    skills: ['Demand forecasting', 'Inventory management', 'Logistics', 'Lean operations', 'Six Sigma'],
    modules: [
      M('Operations Management Basics', 'Processes, capacity and quality.', [['Introduction to Operations', '24:00'], ['Process Design and Capacity', '21:40'], ['Quality Management and Six Sigma', '25:25']]),
      M('Supply Chain Management', 'Move goods efficiently from supplier to customer.', [['Demand Forecasting', '22:50'], ['Inventory Models: EOQ and Safety Stock', '26:15'], ['Logistics and Distribution', '20:35'], ['Building Resilient Supply Chains', '23:10']])
    ]
  }
};

// ---------------------------------------------------------------------------
// New programs
// ---------------------------------------------------------------------------
const NEW_COURSES = [
  {
    title: 'Personal Finance & Wealth Planning',
    description: 'Budgeting, tax-saving, insurance and long-term investing explained for salaried professionals in India. Build a written financial plan you will actually follow.',
    instructor: 'Ananya Kapoor, CFP',
    duration: '8 Weeks',
    price: 1300,
    category: 'finance',
    level: 'Beginner',
    thumbnail: img('1579532537598-459ecdaf39cc'),
    highlights: ['Your own written financial plan by week eight', 'Tax-saving walkthrough under both regimes', 'Mutual fund and index fund selection checklist', 'Live Q&A every Saturday'],
    skills: ['Budgeting', 'Tax planning', 'Mutual funds', 'Insurance planning', 'Retirement planning'],
    modules: [
      M('Money Foundations', 'Know where your money goes.', [['Building a Budget that Sticks', '16:40'], ['Emergency Funds and Debt', '18:15'], ['Understanding Your Payslip and Taxes', '21:30']]),
      M('Investing for the Long Term', 'Grow wealth without guesswork.', [['How Markets Reward Patience', '19:20'], ['Mutual Funds and Index Funds', '23:45'], ['Asset Allocation by Life Stage', '20:10'], ['Avoiding Common Investor Mistakes', '17:35']]),
      M('Protect and Plan', 'Insurance, retirement and your written plan.', [['Health and Term Insurance', '18:50'], ['Retirement and the NPS', '22:05'], ['Writing Your Financial Plan', '15:25']])
    ]
  },
  {
    title: 'Equity Research & Stock Valuation',
    description: 'Learn how sell-side analysts read annual reports, build earnings models and write initiation notes. Cover a listed company from first read to target price.',
    instructor: 'CFA Nikhil Bansal',
    duration: '3 Months',
    price: 2900,
    category: 'finance',
    level: 'Intermediate',
    thumbnail: img('1590283603385-17ffb3a7f29f'),
    highlights: ['Cover one NSE-listed company end to end', 'Earnings model template used by analysts', 'Write and present an initiation report', 'Feedback from a practising research analyst'],
    skills: ['Financial statement analysis', 'Earnings modelling', 'Relative valuation', 'Report writing', 'Industry analysis'],
    modules: [
      M('Reading the Business', 'Annual reports, industries and moats.', [['Inside an Annual Report', '24:30'], ['Industry and Competitive Analysis', '22:15'], ['Quality of Earnings Red Flags', '20:40']]),
      M('Modelling and Valuation', 'Forecast earnings and set a target price.', [['Building the Earnings Model', '31:10'], ['P/E, EV/EBITDA and Peer Sets', '23:55'], ['DCF for Equity Analysts', '27:20'], ['Arriving at a Target Price', '18:45']]),
      M('Writing the Research Note', 'Communicate a clear call.', [['Structure of an Initiation Report', '19:30'], ['Charts that Support Your Thesis', '16:20'], ['Pitching to Fund Managers', '21:05']])
    ]
  },
  {
    title: 'Cybersecurity Essentials',
    description: 'A practical introduction to defending networks, applications and people. Learn how attacks actually happen and the controls that stop them, with guided labs.',
    instructor: 'Farhan Qureshi',
    duration: '10 Weeks',
    price: 1700,
    category: 'technology',
    level: 'Beginner',
    thumbnail: img('1550751827-4bd374c3f58b'),
    highlights: ['Browser-based hacking labs, no setup needed', 'Covers CompTIA Security+ objectives', 'Incident response tabletop exercise', 'Security checklist for small teams'],
    skills: ['Network security', 'Threat modelling', 'OWASP Top 10', 'Incident response', 'Identity & access'],
    modules: [
      M('Security Foundations', 'Threats, risks and the CIA triad.', [['How Attacks Really Happen', '20:15'], ['Threat Modelling Basics', '18:30'], ['Passwords, MFA and Identity', '17:45']]),
      M('Defending Systems', 'Protect networks and applications.', [['Network Security and Firewalls', '24:20'], ['The OWASP Top 10', '27:35'], ['Securing Cloud Accounts', '21:10'], ['Phishing and Social Engineering', '16:55']]),
      M('Detect and Respond', 'When prevention fails.', [['Logging and Monitoring', '19:40'], ['Running an Incident Response', '23:15'], ['Security Careers and Certifications', '14:50']])
    ]
  },
  {
    title: 'Generative AI for Professionals',
    description: 'Use large language models safely and productively at work. Prompt design, retrieval-augmented generation, evaluation and building small AI tools without a research background.',
    instructor: 'Dr. Ishita Menon',
    duration: '2 Months',
    price: 3500,
    category: 'technology',
    level: 'Intermediate',
    thumbnail: img('1620712943543-bcc4688e7485'),
    highlights: ['Build three working AI assistants', 'Prompt patterns library', 'Responsible-AI and data privacy module', 'Capstone demo day with industry judges'],
    skills: ['Prompt engineering', 'LLM APIs', 'Retrieval-augmented generation', 'AI evaluation', 'Responsible AI'],
    modules: [
      M('How LLMs Work', 'Just enough theory to use them well.', [['From Autocomplete to Assistants', '18:25'], ['Tokens, Context and Limits', '16:50'], ['Where LLMs Fail', '19:35']]),
      M('Prompting and Tools', 'Get reliable output.', [['Prompt Patterns that Work', '24:10'], ['Structured Output and Function Calling', '22:45'], ['Retrieval-Augmented Generation', '27:30'], ['Evaluating AI Output', '20:20']]),
      M('Shipping AI Responsibly', 'From prototype to team tool.', [['Privacy, Bias and Safety', '21:15'], ['Building an Internal AI Assistant', '28:40'], ['Measuring Impact', '15:55']])
    ]
  },
  {
    title: 'UI/UX Design Foundations',
    description: 'Learn the design process product teams use: research, wireframes, visual design and usability testing. Finish with a case study ready for your portfolio.',
    instructor: 'Tanvi Bhatt',
    duration: '8 Weeks',
    price: 1600,
    category: 'technology',
    level: 'Beginner',
    thumbnail: img('1561070791-2526d30994b5'),
    highlights: ['Figma from zero to prototypes', 'Run real usability tests', 'Portfolio case study with mentor review', 'Design critique every week'],
    skills: ['User research', 'Wireframing', 'Figma', 'Visual design', 'Usability testing'],
    modules: [
      M('Understanding Users', 'Research before pixels.', [['What UX Designers Do', '15:20'], ['User Interviews', '19:45'], ['Personas and Journey Maps', '18:10']]),
      M('Designing Interfaces', 'From sketches to high fidelity.', [['Wireframes and Information Architecture', '21:30'], ['Figma Essentials', '26:05'], ['Typography, Colour and Layout', '22:40'], ['Interactive Prototypes', '19:15']]),
      M('Testing and Portfolio', 'Validate and present your work.', [['Running Usability Tests', '20:50'], ['Accessibility Basics', '17:25'], ['Writing a Portfolio Case Study', '16:35']])
    ]
  },
  {
    title: 'Excel for Business Analysis',
    description: 'Go from everyday spreadsheets to confident analysis. Lookups, pivot tables, dynamic arrays and dashboards that managers can use without asking you how.',
    instructor: 'Pooja Iyer',
    duration: '6 Weeks',
    price: 900,
    category: 'analytics',
    level: 'Beginner',
    thumbnail: img('1543286386-713bdd548da4'),
    highlights: ['Practice files for every lesson', 'Keyboard-shortcut drills', 'Build a one-page management dashboard', 'Lifetime access to templates'],
    skills: ['XLOOKUP', 'Pivot tables', 'Dynamic arrays', 'Charts', 'Dashboarding'],
    modules: [
      M('Working Faster in Excel', 'Habits that save hours.', [['Tables, Ranges and Shortcuts', '14:35'], ['Cleaning Data with Text Functions', '17:20'], ['XLOOKUP and INDEX/MATCH', '19:55']]),
      M('Analysis and Dashboards', 'Answer questions and show the result.', [['Pivot Tables in Depth', '22:10'], ['Dynamic Arrays and FILTER', '18:45'], ['Charts that Communicate', '16:30'], ['Building a One-Page Dashboard', '24:15']])
    ]
  },
  {
    title: 'Statistics for Data-Driven Decisions',
    description: 'The statistics working analysts use every day: distributions, sampling, hypothesis tests, A/B testing and regression, taught with business examples instead of proofs.',
    instructor: 'Dr. Manish Agarwal',
    duration: '3 Months',
    price: 2300,
    category: 'analytics',
    level: 'Intermediate',
    thumbnail: img('1518186285589-2f7649de83e0'),
    highlights: ['Design and analyse a real A/B test', 'Intuition first, formulas second', 'Weekly problem sets with solutions', 'Spreadsheet and notebook versions of every example'],
    skills: ['Descriptive statistics', 'Probability', 'Hypothesis testing', 'A/B testing', 'Linear regression'],
    modules: [
      M('Describing Data', 'Summaries, spread and distributions.', [['Averages and Spread', '18:40'], ['Probability Distributions', '23:15'], ['Sampling and the Central Limit Theorem', '21:50']]),
      M('Inference and Experiments', 'Decide with confidence.', [['Confidence Intervals', '20:25'], ['Hypothesis Testing', '24:35'], ['Designing A/B Tests', '22:05'], ['Common Statistical Traps', '17:40']]),
      M('Modelling Relationships', 'Regression for business questions.', [['Correlation vs Causation', '16:55'], ['Simple and Multiple Regression', '26:20'], ['Presenting Statistical Findings', '15:45']])
    ]
  },
  {
    title: 'Performance Marketing & Google Ads',
    description: 'Plan, launch and optimise paid acquisition across Google Search, YouTube and Performance Max. Learn bidding, tracking and how to report ROAS that finance will trust.',
    instructor: 'Kabir Sethi',
    duration: '10 Weeks',
    price: 2400,
    category: 'marketing',
    level: 'Intermediate',
    thumbnail: img('1533750349088-cd871a92f312'),
    highlights: ['Run a live campaign with a mentor', 'Google Ads certification prep', 'Conversion tracking set up properly', 'Media plan and reporting templates'],
    skills: ['Google Ads', 'Keyword research', 'Bidding strategies', 'Conversion tracking', 'ROAS reporting'],
    modules: [
      M('Paid Search Foundations', 'Keywords, auctions and account structure.', [['How the Ads Auction Works', '18:30'], ['Keyword Research and Match Types', '22:45'], ['Structuring an Account', '19:10']]),
      M('Optimising Campaigns', 'Bids, creatives and landing pages.', [['Smart Bidding Strategies', '23:20'], ['Writing Responsive Search Ads', '17:55'], ['YouTube and Performance Max', '24:40'], ['Landing Page Optimisation', '20:15']]),
      M('Tracking and Reporting', 'Measure what matters.', [['Conversion Tracking with GA4', '21:35'], ['Calculating ROAS and CAC', '16:50'], ['Reporting to Leadership', '15:30']])
    ]
  },
  {
    title: 'Brand Strategy & Storytelling',
    description: 'Define what a brand stands for and express it consistently. Positioning, brand architecture, messaging and the stories that make people remember you.',
    instructor: 'Ritika Sen',
    duration: '8 Weeks',
    price: 1500,
    category: 'marketing',
    level: 'All levels',
    thumbnail: img('1557838923-2985c318be48'),
    highlights: ['Write a positioning statement for a real brand', 'Brand audit framework', 'Case studies of Indian D2C brands', 'Peer critique circles'],
    skills: ['Positioning', 'Brand architecture', 'Messaging', 'Storytelling', 'Brand audits'],
    modules: [
      M('Brand Foundations', 'What a brand is and is not.', [['What Makes a Brand', '17:15'], ['Finding Your Positioning', '21:40'], ['Brand Architecture', '18:25']]),
      M('Telling the Story', 'Messages and narratives that stick.', [['Messaging Hierarchies', '19:50'], ['Storytelling for Brands', '23:05'], ['Visual Identity Basics', '16:40'], ['Running a Brand Audit', '20:30']])
    ]
  },
  {
    title: 'Product Management Fundamentals',
    description: 'Learn how product managers discover problems worth solving, prioritise, work with engineering and design, and measure outcomes. Includes PM interview preparation.',
    instructor: 'Aditya Rao',
    duration: '3 Months',
    price: 3000,
    category: 'management',
    level: 'Intermediate',
    thumbnail: img('1531403009284-440f080d1e12'),
    highlights: ['Write a PRD for a real product', 'Prioritisation frameworks in practice', 'Mock PM interviews with feedback', 'Guest sessions with product leaders'],
    skills: ['Product discovery', 'Prioritisation', 'Writing PRDs', 'Product metrics', 'Stakeholder management'],
    modules: [
      M('The Product Mindset', 'What PMs actually do.', [['The Role of a Product Manager', '19:25'], ['Discovering Customer Problems', '22:35'], ['Defining Product Vision', '17:50']]),
      M('Building the Right Thing', 'Prioritise and specify.', [['Prioritisation Frameworks', '21:15'], ['Writing a Great PRD', '24:20'], ['Working with Design and Engineering', '20:05'], ['Running Experiments', '18:40']]),
      M('Measuring and Growing', 'Metrics, launches and careers.', [['North Star and Product Metrics', '22:55'], ['Launching a Feature', '16:30'], ['Cracking the PM Interview', '25:10']])
    ]
  }
];

// ---------------------------------------------------------------------------
// Reviewers and review copy
// ---------------------------------------------------------------------------
const REVIEWERS = [
  { name: 'Neha Kulkarni', email: 'neha.kulkarni@example.com' },
  { name: 'Rohit Bhatia', email: 'rohit.bhatia@example.com' },
  { name: 'Shreya Menon', email: 'shreya.menon@example.com' },
  { name: 'Aman Gupta', email: 'aman.gupta@example.com' },
  { name: 'Divya Nair', email: 'divya.nair@example.com' },
  { name: 'Siddharth Joshi', email: 'siddharth.joshi@example.com' }
];
const REVIEWER_PASSWORD = 'learner2024';

const REVIEW_COPY = {
  finance: [
    [5, 'The mentor walked through every spreadsheet line by line. I finally understand how the numbers connect, and I used the templates at work the same month.'],
    [4, 'Very practical and well paced. A couple of lessons assume you already know accounting basics, so keep a refresher handy, but the case studies are excellent.'],
    [5, 'Worth every rupee. The weekly assignments forced me to actually do the work instead of just watching videos.'],
    [3, 'Good content overall. I wanted more Indian market examples in the second module, though the live Q&A sessions made up for it.']
  ],
  technology: [
    [5, 'Clear explanations and the labs are genuinely hands-on. I shipped my first project in week three and the code reviews were detailed and kind.'],
    [4, 'Solid course. The pace picks up quickly in the second half, so plan extra hours, but the mentor responds fast on the forum.'],
    [5, 'This is the course I wish I had taken two years ago. The capstone alone taught me more than a semester of college.'],
    [4, 'Great structure and up-to-date material. I would have liked one more lesson on debugging, but everything else was spot on.']
  ],
  analytics: [
    [5, 'I went from copying formulas to building dashboards my manager actually uses. The practice datasets are realistic and messy, which is exactly what you need.'],
    [4, 'Well organised and easy to follow. Some videos could be shorter, but the exercises are excellent.'],
    [5, 'The mentor feedback on my final dashboard was incredibly specific. Landed an analyst interview partly thanks to the portfolio piece.'],
    [3, 'Useful course, though I already knew a lot of the first module. The later lessons were where I learned the most.']
  ],
  marketing: [
    [5, 'Packed with frameworks I now use every week. Running a real campaign with a mentor watching was nerve-wracking and incredibly useful.'],
    [4, 'Practical, current and well taught. A few examples are a bit generic, but the templates are worth the price on their own.'],
    [5, 'Loved the critique sessions. My writing and campaign planning improved noticeably within a month.'],
    [4, 'Great balance of strategy and execution. I would recommend it to anyone moving into a marketing role.']
  ],
  management: [
    [5, 'The case discussions were the highlight. Small cohort, thoughtful mentor and tools I applied with my team immediately.'],
    [4, 'Clear and structured. Some theory-heavy lessons, but the assignments tie everything back to real work.'],
    [5, 'Helped me prepare for a promotion to team lead. The frameworks are simple enough to actually remember under pressure.'],
    [3, 'Good overall. I expected a bit more depth on remote teams, but the mentor was generous with extra resources.']
  ]
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------

const ensureVideo = (url) => (VIDEO_URLS.includes(url) ? url : nextVideo());

// Merge a target syllabus into a course document without touching existing ids
const mergeModules = (course, targetModules) => {
  let added = 0;
  targetModules.forEach((target, mIdx) => {
    let mod = course.modules.find((m) => m.title === target.title);
    if (!mod) {
      course.modules.push({ title: target.title, description: target.description, order: mIdx + 1, lessons: [] });
      mod = course.modules[course.modules.length - 1];
    } else if (!mod.description) {
      mod.description = target.description;
    }
    target.lessons.forEach(([title, duration]) => {
      if (mod.lessons.some((l) => l.title === title)) return;
      mod.lessons.push({ title, duration, videoUrl: nextVideo(), description: '', order: mod.lessons.length + 1 });
      added += 1;
    });
  });

  // Every lesson plays one of the Mozark sessions; keep order numbers contiguous
  course.modules.forEach((mod, mIdx) => {
    mod.order = mIdx + 1;
    mod.lessons.forEach((lesson, lIdx) => {
      lesson.order = lIdx + 1;
      lesson.videoUrl = ensureVideo(lesson.videoUrl);
    });
  });
  return added;
};

const seedReviewers = async () => {
  const hash = await bcrypt.hash(REVIEWER_PASSWORD, 10);
  const users = [];
  for (const r of REVIEWERS) {
    let user = await User.findOne({ email: r.email });
    if (!user) {
      user = await User.create({ name: r.name, email: r.email, password: hash, role: 'student' });
      console.log(`  + reviewer ${r.email}`);
    }
    users.push(user);
  }
  return users;
};

const seedReviews = async (courses, reviewers) => {
  let written = 0;
  for (let cIdx = 0; cIdx < courses.length; cIdx++) {
    const course = courses[cIdx];
    const copy = REVIEW_COPY[course.category] || REVIEW_COPY.technology;
    const howMany = 2 + (cIdx % 3); // 2–4 reviews per course

    for (let i = 0; i < howMany; i++) {
      const reviewer = reviewers[(cIdx + i) % reviewers.length];
      const [rating, text] = copy[(cIdx + i) % copy.length];

      // Reviewers are enrolled learners
      await User.updateOne(
        { _id: reviewer._id, 'enrolledCourses.courseId': { $ne: course._id } },
        { $push: { enrolledCourses: { courseId: course._id, enrolledAt: daysAgo(60 + cIdx * 3 + i * 7) } } }
      );

      const res = await Review.updateOne(
        { courseId: course._id, userId: reviewer._id },
        {
          $setOnInsert: {
            courseId: course._id,
            userId: reviewer._id,
            userName: reviewer.name,
            rating,
            text,
            createdAt: daysAgo(4 + cIdx * 2 + i * 9),
            updatedAt: daysAgo(4 + cIdx * 2 + i * 9)
          }
        },
        { upsert: true, timestamps: false }
      );
      if (res.upsertedCount) written += 1;
    }
    await Review.refreshCourseRating(course._id);
  }
  return written;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Enrich existing programs
  for (const [title, spec] of Object.entries(EXISTING)) {
    const course = await Course.findOne({ title });
    if (!course) {
      console.log(`  ! not found, skipping: ${title}`);
      continue;
    }
    const added = mergeModules(course, spec.modules);
    course.level = spec.level;
    course.language = course.language || 'English';
    course.highlights = spec.highlights;
    course.skills = spec.skills;
    await course.save();
    console.log(`  ~ ${title}: +${added} lessons`);
  }

  // 2. Upsert new programs
  for (const spec of NEW_COURSES) {
    let course = await Course.findOne({ title: spec.title });
    const isNew = !course;
    if (!course) course = new Course({ title: spec.title, modules: [] });

    Object.assign(course, {
      description: spec.description,
      instructor: spec.instructor,
      duration: spec.duration,
      price: spec.price,
      category: spec.category,
      level: spec.level,
      language: 'English',
      thumbnail: spec.thumbnail,
      highlights: spec.highlights,
      skills: spec.skills,
      isActive: true
    });
    const added = mergeModules(course, spec.modules);
    await course.save();
    console.log(`  ${isNew ? '+' : '~'} ${spec.title}: +${added} lessons`);
  }

  // 3. Reviews
  const reviewers = await seedReviewers();
  const courses = await Course.find({ isActive: true }).sort({ createdAt: 1 }).select('_id category title').lean();
  const written = await seedReviews(courses, reviewers);
  console.log(`  + ${written} reviews`);

  // 4. Drop cached course responses
  await connectRedis();
  await invalidateCourseCache();
  await disconnectRedis();

  console.log(`Done. ${courses.length} active courses.`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Catalog seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
