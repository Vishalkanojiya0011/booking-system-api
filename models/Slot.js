const mongoose = require('mongoose');

// A Slot represents one bookable time window for a Resource.
// Slots can be pre-generated (e.g. every 30 min from 9am-5pm) so the
// "list free slots for a date" endpoint has something to query.
const slotSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD' for easy querying by day
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
  },
  { timestamps: true }
);

// One resource can't have two identical slot windows
slotSchema.index({ resource: 1, startTime: 1 }, { unique: true });
slotSchema.index({ resource: 1, date: 1 });

module.exports = mongoose.model('Slot', slotSchema);
