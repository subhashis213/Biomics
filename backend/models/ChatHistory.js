const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true }
  },
  { _id: false, timestamps: { createdAt: 'timestamp', updatedAt: false } }
);

const chatHistorySchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    messages: { type: [messageSchema], default: [] },
    language: { type: String, enum: ['en', 'hi', 'or'], default: 'en' },
    examLevel: {
      type: String,
      enum: ['Class 9', 'Class 10', 'Class 11', 'Class 12', 'NEET'],
      default: 'Class 11'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
