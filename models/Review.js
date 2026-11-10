const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    reviewerName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    source: { type: String, enum: ['verified', 'admin'], required: true },
  },
  { timestamps: true }
);

reviewSchema.index({ booking: 1 }, { unique: true, partialFilterExpression: { booking: { $type: 'objectId' } } });
reviewSchema.index({ resource: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
