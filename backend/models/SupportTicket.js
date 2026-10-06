const mongoose = require('mongoose');

const TOPICS = ['account', 'payment', 'course', 'technical', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved'];

const messageSchema = new mongoose.Schema({
  from: { type: String, enum: ['customer', 'support'], default: 'customer' },
  authorName: { type: String, trim: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  // Null for tickets raised by guests (no account / signed out)
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  topic: { type: String, enum: TOPICS, required: true },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  orderId: { type: String, trim: true },
  status: { type: String, enum: STATUSES, default: 'open' },
  messages: [messageSchema]
}, { timestamps: true });

supportTicketSchema.index({ user: 1, createdAt: -1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
SupportTicket.TOPICS = TOPICS;
SupportTicket.STATUSES = STATUSES;

module.exports = SupportTicket;
