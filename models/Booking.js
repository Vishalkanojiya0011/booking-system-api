const mongoose = require('mongoose');

const patientDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true },
    age: { type: Number, required: true, min: 0 },
    gender: { type: String, required: true },
    mobileNumber: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    currentHealthProblem: { type: String, trim: true, maxlength: 4000, default: '' },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    patientDetails: { type: patientDetailsSchema, default: undefined },
    status: { type: String, enum: ['confirmed', 'cancelled', 'completed'], default: 'confirmed' },
    confirmationEmailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// THE CORE CONCEPT: this unique index is what makes concurrency safe.
// If two requests try to book the same resource + startTime at the same
// instant, MongoDB itself will reject the second insert with error code
// 11000 (duplicate key) — we never have to "check then write" and hope
// nobody else writes in between. We catch that error in the route and
// turn it into a 409 Conflict.
bookingSchema.index(
  { resource: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);

module.exports = mongoose.model('Booking', bookingSchema);
