const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  url: { type: String, required: true },
  category: { type: String, default: 'General' },
  module: { type: String, default: 'General' },
  uploadedAt: { type: Date, default: Date.now },
  materials: [
    {
      name: { type: String },      // original display filename
      filename: { type: String }   // server-stored filename
    }
  ]
});

module.exports = mongoose.model('Video', videoSchema);
