const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Dr. Sharma", "Meeting Room A", "Turf 1"
    type: { type: String, required: true, trim: true }, // e.g. "doctor", "room", "turf"
    description: { type: String, trim: true },
    slotDurationMinutes: { type: Number, default: 30 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    profilePhoto: { type: String, default: '' },
    qualification: { type: String, trim: true, default: '' },
    experienceYears: { type: Number, min: 0, default: 0 },
    registrationNumber: { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['', 'Male', 'Female', 'Other'], default: '' },
    languages: { type: [String], default: [] },
    consultationFee: { type: Number, min: 0, default: 0 },
    availableDays: {
      type: [String],
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    availableStartTime: { type: String, default: '09:00' },
    availableEndTime: { type: String, default: '20:00' },
    consultationTypes: { type: [String], enum: ['Online', 'Offline'], default: ['Offline'] },
    clinicName: { type: String, trim: true, default: '' },
    clinicAddress: { type: String, trim: true, default: '' },
    totalPatientsTreatedEstimate: { type: Number, min: 0, default: 0 },
    awardsAndAchievements: { type: [String], default: [] },
    clinicPhotos: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);
