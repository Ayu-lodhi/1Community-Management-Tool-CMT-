const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  eventTitle: { type: String, default: '' },
  rating: { type: Number, min: 1, max: 5, required: true },
  feedback: { type: String, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewerName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

reviewSchema.index({ reviewedBy: 1, createdAt: -1 });
reviewSchema.index({ studentId: 1, createdAt: -1 });
reviewSchema.index({ eventId: 1 });

module.exports = mongoose.model('Review', reviewSchema);
