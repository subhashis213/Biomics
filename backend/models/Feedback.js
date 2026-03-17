const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  message: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
