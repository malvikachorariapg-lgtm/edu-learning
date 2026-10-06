require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./models/Course');

// Multiple courses for all categories
const courses = [
  // Technology Courses
  {
    title: 'Full Stack Web Development Bootcamp',
    description: 'Master modern web development with React, Node.js, MongoDB, and Express. Build real-world applications from scratch.',
    instructor: 'Rajesh Kumar',
    duration: '6 Months',
    price: 1500,
    category: 'technology',
    thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
    modules: [
      {
        title: 'HTML & CSS Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'HTML Basics',
            videoUrl: 'https://www.youtube.com/watch?v=bPWmcPGdMn4',
            duration: '15:30',
            order: 1
          },
          {
            title: 'CSS Styling',
            videoUrl: 'https://www.youtube.com/watch?v=hBUQ8x1WlAY',
            duration: '20:45',
            order: 2
          }
        ]
      }
    ]
  },
  {
    title: 'Data Science with Python',
    description: 'Learn data analysis, visualization, and machine learning with Python, NumPy, Pandas, and Scikit-learn.',
    instructor: 'Dr. Priya Sharma',
    duration: '4 Months',
    price: 2000,
    category: 'technology',
    thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
    modules: [
      {
        title: 'Python for Data Science',
        order: 1,
        lessons: [
          {
            title: 'Python Basics',
            videoUrl: 'https://www.youtube.com/watch?v=wkA_fK_-TlM',
            duration: '25:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Cloud Computing with AWS',
    description: 'Master Amazon Web Services - EC2, S3, Lambda, RDS, and more. Get AWS certification ready.',
    instructor: 'Amit Verma',
    duration: '3 Months',
    price: 1800,
    category: 'technology',
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    modules: [
      {
        title: 'AWS Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Introduction to AWS',
            videoUrl: 'https://www.youtube.com/watch?v=MItFKhLKA18',
            duration: '18:30',
            order: 1
          }
        ]
      }
    ]
  },

  // Finance Courses
  {
    title: 'Investment Banking Operations Professional',
    description: 'Comprehensive training in investment banking operations, trade lifecycle, and risk management.',
    instructor: 'CA Vikram Singh',
    duration: '6 Months',
    price: 2500,
    category: 'finance',
    thumbnail: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800',
    modules: [
      {
        title: 'Investment Banking Basics',
        order: 1,
        lessons: [
          {
            title: 'Introduction to IB',
            videoUrl: 'https://www.youtube.com/watch?v=VkjUvAmHMiE',
            duration: '30:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Financial Modeling & Valuation',
    description: 'Master financial modeling, DCF valuation, LBO modeling, and M&A analysis for investment banking.',
    instructor: 'CFA Rahul Mehta',
    duration: '4 Months',
    price: 2200,
    category: 'finance',
    thumbnail: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800',
    modules: [
      {
        title: 'Financial Modeling Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Excel for Finance',
            videoUrl: 'https://www.youtube.com/watch?v=AEWfYNZsPbg',
            duration: '28:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Risk Management & Compliance',
    description: 'Learn operational risk, credit risk, market risk, and regulatory compliance in banking.',
    instructor: 'FRM Neha Gupta',
    duration: '3 Months',
    price: 1800,
    category: 'finance',
    thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    modules: [
      {
        title: 'Risk Management Basics',
        order: 1,
        lessons: [
          {
            title: 'Types of Risk',
            videoUrl: 'https://www.youtube.com/watch?v=6OdXHObIJgo',
            duration: '22:00',
            order: 1
          }
        ]
      }
    ]
  },

  // Analytics Courses
  {
    title: 'Business Analytics with Power BI',
    description: 'Master data visualization and business intelligence with Power BI, DAX, and advanced analytics.',
    instructor: 'Sneha Rao',
    duration: '3 Months',
    price: 1200,
    category: 'analytics',
    thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
    modules: [
      {
        title: 'Power BI Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Getting Started with Power BI',
            videoUrl: 'https://www.youtube.com/watch?v=OEd2WPYuO-I',
            duration: '20:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Data Analytics with SQL & Tableau',
    description: 'Learn SQL for data querying, data analysis techniques, and create stunning visualizations with Tableau.',
    instructor: 'Karthik Reddy',
    duration: '4 Months',
    price: 1500,
    category: 'analytics',
    thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    modules: [
      {
        title: 'SQL Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Introduction to SQL',
            videoUrl: 'https://www.youtube.com/watch?v=bPWmcPGdMn4',
            duration: '25:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Predictive Analytics & Machine Learning',
    description: 'Build predictive models using Python, scikit-learn, and advanced machine learning algorithms.',
    instructor: 'Dr. Arun Kumar',
    duration: '5 Months',
    price: 2000,
    category: 'analytics',
    thumbnail: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800',
    modules: [
      {
        title: 'Introduction to ML',
        order: 1,
        lessons: [
          {
            title: 'What is Machine Learning',
            videoUrl: 'https://www.youtube.com/watch?v=hBUQ8x1WlAY',
            duration: '30:00',
            order: 1
          }
        ]
      }
    ]
  },

  // Marketing Courses
  {
    title: 'Digital Marketing Masterclass',
    description: 'Complete digital marketing course covering SEO, SEM, social media, email marketing, and analytics.',
    instructor: 'Meera Joshi',
    duration: '4 Months',
    price: 1500,
    category: 'marketing',
    thumbnail: 'https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=800',
    modules: [
      {
        title: 'Digital Marketing Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Introduction to Digital Marketing',
            videoUrl: 'https://www.youtube.com/watch?v=wkA_fK_-TlM',
            duration: '22:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Content Marketing & Copywriting',
    description: 'Master content creation, copywriting, storytelling, and content strategy for brands.',
    instructor: 'Anjali Desai',
    duration: '3 Months',
    price: 1200,
    category: 'marketing',
    thumbnail: 'https://images.unsplash.com/photo-1542435503-956c469947f6?w=800',
    modules: [
      {
        title: 'Content Marketing Basics',
        order: 1,
        lessons: [
          {
            title: 'What is Content Marketing',
            videoUrl: 'https://www.youtube.com/watch?v=MItFKhLKA18',
            duration: '18:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Social Media Marketing & Advertising',
    description: 'Learn Facebook, Instagram, LinkedIn, Twitter marketing and paid advertising strategies.',
    instructor: 'Rohan Malhotra',
    duration: '3 Months',
    price: 1300,
    category: 'marketing',
    thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800',
    modules: [
      {
        title: 'Social Media Strategy',
        order: 1,
        lessons: [
          {
            title: 'Social Media Platforms Overview',
            videoUrl: 'https://www.youtube.com/watch?v=VkjUvAmHMiE',
            duration: '20:00',
            order: 1
          }
        ]
      }
    ]
  },

  // Management Courses
  {
    title: 'Project Management Professional (PMP)',
    description: 'Complete PMP certification preparation covering PMBOK, project lifecycle, and agile methodologies.',
    instructor: 'Suresh Patel',
    duration: '4 Months',
    price: 1800,
    category: 'management',
    thumbnail: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800',
    modules: [
      {
        title: 'Project Management Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'Introduction to PM',
            videoUrl: 'https://www.youtube.com/watch?v=AEWfYNZsPbg',
            duration: '25:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Strategic Management & Leadership',
    description: 'Develop strategic thinking, leadership skills, and organizational management capabilities.',
    instructor: 'MBA Kavita Nair',
    duration: '5 Months',
    price: 2000,
    category: 'management',
    thumbnail: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800',
    modules: [
      {
        title: 'Leadership Fundamentals',
        order: 1,
        lessons: [
          {
            title: 'What Makes a Great Leader',
            videoUrl: 'https://www.youtube.com/watch?v=6OdXHObIJgo',
            duration: '28:00',
            order: 1
          }
        ]
      }
    ]
  },
  {
    title: 'Operations & Supply Chain Management',
    description: 'Master operations strategy, logistics, inventory management, and supply chain optimization.',
    instructor: 'Vivek Sharma',
    duration: '4 Months',
    price: 1700,
    category: 'management',
    thumbnail: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
    modules: [
      {
        title: 'Operations Management Basics',
        order: 1,
        lessons: [
          {
            title: 'Introduction to Operations',
            videoUrl: 'https://www.youtube.com/watch?v=OEd2WPYuO-I',
            duration: '24:00',
            order: 1
          }
        ]
      }
    ]
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(' Connected to MongoDB');

    // Clear existing courses
    await Course.deleteMany({});
    console.log('  Cleared existing courses');

    // Insert all courses
    const createdCourses = await Course.insertMany(courses);
    console.log(` Created ${createdCourses.length} courses successfully!`);
    
    console.log('\n Courses by Category:');
    const categories = ['finance', 'technology', 'analytics', 'marketing', 'management'];
    categories.forEach(cat => {
      const count = createdCourses.filter(c => c.category === cat).length;
      console.log(`  ${cat}: ${count} courses`);
    });

    console.log('\n✨ Database seeded successfully!');
    
    // Close connection
    await mongoose.connection.close();
    console.log(' Connection closed');
    process.exit(0);
  } catch (error) {
    console.error(' Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
