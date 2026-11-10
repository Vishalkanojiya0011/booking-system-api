const express = require('express');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const Resource = require('../models/Resource');
const User = require('../models/User');
const Review = require('../models/Review');
const { protect } = require('../middleware/auth');
const { sendBookingConfirmation } = require('../utils/booking-email');
const { getAge, normalizePatientProfile } = require('../utils/patient-profile');

const router = express.Router();

// POST /api/bookings (logged-in users only) — book a slot
// body: { slotId }
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role === 'doctor') {
      return res.status(403).json({ message: 'Doctor accounts cannot book patient appointments' });
    }
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ message: 'slotId is required' });
    if (!['patient', 'user'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only patient accounts can book appointments' });
    }

    const patientProfile = normalizePatientProfile({
      name: req.user.name,
      email: req.user.email,
      dateOfBirth: req.user.dateOfBirth,
      gender: req.user.gender,
      mobileNumber: req.user.mobileNumber,
      address: req.user.address,
      city: req.user.city,
      state: req.user.state,
      currentHealthProblem: req.body.currentHealthProblem,
    });
    if (patientProfile.error) {
      return res.status(400).json({
        message: `Complete your patient details in My profile before booking: ${patientProfile.error}`,
      });
    }
    if (!patientProfile.value.currentHealthProblem) {
      return res.status(400).json({
        message: 'Describe your current health problem, or enter "No current health problem" before booking',
      });
    }

    const slot = await Slot.findById(slotId);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });
    const resource = await Resource.findById(slot.resource).select('name createdBy');
    if (resource && resource.createdBy) {
      const owner = await User.findById(resource.createdBy).select('role accountStatus');
      if (owner?.role === 'doctor' && ['suspended', 'blocked'].includes(owner.accountStatus)) {
        return res.status(409).json({ message: 'This doctor is not currently accepting appointments' });
      }
    }

    // We do NOT check "is it free?" and then write — that has a race
    // window where two requests can both pass the check. Instead we
    // just try to create the booking directly. The unique index on
    // { resource, startTime } (for status: 'confirmed') in the Booking
    // model is what actually prevents two people getting the same slot,
    // because MongoDB enforces it atomically at the database level.
    const booking = await Booking.create({
      user: req.user._id,
      resource: slot.resource,
      slot: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      patientDetails: {
        ...patientProfile.value,
        age: getAge(patientProfile.value.dateOfBirth),
      },
    });

    const confirmationEmail = await sendBookingConfirmation({
      email: req.user.email,
      patientName: req.user.name,
      doctorName: resource ? resource.name : 'your doctor',
      startTime: slot.startTime,
      endTime: slot.endTime,
    });

    booking.confirmationEmailSent = confirmationEmail.sent;
    await booking.save();

    res.status(201).json({
      ...booking.toObject(),
      confirmationEmailReason: confirmationEmail.reason,
    });
  } catch (err) {
    // 11000 = MongoDB duplicate key error -> someone else already holds this slot
    if (err.code === 11000) {
      return res.status(409).json({ message: 'This slot was just booked by someone else. Please pick another.' });
    }
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bookings/me — list the logged-in user's own bookings
router.get('/me', protect, async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate('resource', 'name type')
    .sort({ startTime: 1 });
  const reviewedBookings = new Set((await Review.find({
    booking: { $in: bookings.map((booking) => booking._id) },
  }).select('booking')).map((review) => review.booking.toString()));
  res.json(bookings.map((booking) => ({
    ...booking.toObject(),
    hasReview: reviewedBookings.has(booking._id.toString()),
  })));
});

router.post('/:id/review', protect, async (req, res) => {
  try {
    if (req.user.role === 'doctor' || req.user.role === 'admin') {
      return res.status(403).json({ message: 'Only patients can submit appointment reviews' });
    }
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id })
      .populate('resource', 'name');
    if (!booking) return res.status(404).json({ message: 'Appointment not found' });
    if (booking.status !== 'confirmed' || booking.endTime >= new Date()) {
      return res.status(409).json({ message: 'You can review an appointment after its scheduled time has passed' });
    }
    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment || comment.length > 2000) {
      return res.status(400).json({ message: 'Provide a rating from 1 to 5 and a review of up to 2000 characters' });
    }
    const review = await Review.create({
      resource: booking.resource._id,
      patient: req.user._id,
      booking: booking._id,
      reviewerName: req.user.name,
      rating,
      comment,
      source: 'verified',
    });
    booking.status = 'completed';
    try {
      await booking.save();
    } catch (error) {
      await Review.deleteOne({ _id: review._id }).catch((cleanupError) => {
        console.error('Could not roll back an uncompleted appointment review:', cleanupError);
      });
      throw error;
    }
    res.status(201).json({ message: 'Thank you for sharing your verified review', review });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A review has already been submitted for this appointment' });
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bookings/doctor — list appointments for the signed-in doctor's resources
router.get('/doctor', protect, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Doctor access required' });
  }
  const resources = await Resource.find({ createdBy: req.user._id }).select('_id');
  const bookings = await Booking.find({ resource: { $in: resources.map((resource) => resource._id) } })
    .populate('resource', 'name type')
    .populate('user', 'name email')
    .sort({ startTime: 1 });
  res.json(bookings);
});

// POST /api/bookings/:id/confirmation — retry a missing confirmation email
router.post('/:id/confirmation', protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id })
      .populate('resource', 'name');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed appointments can receive an email confirmation' });
    }

    const email = await sendBookingConfirmation({
      email: req.user.email,
      patientName: req.user.name,
      doctorName: booking.resource ? booking.resource.name : 'your doctor',
      startTime: booking.startTime,
      endTime: booking.endTime,
    });

    if (!email.sent) {
      const message = email.reason === 'not_configured'
        ? 'Email is not configured. Add your Gmail App Password to .env and restart the server.'
        : 'The confirmation email could not be sent. Check the SMTP settings and try again.';
      return res.status(email.reason === 'not_configured' ? 503 : 502).json({ message });
    }

    booking.confirmationEmailSent = true;
    await booking.save();
    res.json({ message: 'Appointment confirmation email sent', confirmationEmailSent: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/bookings/:id — cancel a booking (only your own)
router.delete('/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const isPatientOwner = booking.user.toString() === req.user._id.toString();
    const ownsDoctorResource = req.user.role === 'doctor' &&
      await Resource.exists({ _id: booking.resource, createdBy: req.user._id });
    if (!isPatientOwner && !ownsDoctorResource) {
      return res.status(403).json({ message: 'You can only cancel your own booking or an appointment for your doctor profile' });
    }
    if (booking.status !== 'confirmed') {
      return res.status(409).json({ message: 'Only confirmed appointments can be cancelled' });
    }

    booking.status = 'cancelled';
    await booking.save(); // partial unique index means this frees the slot for others
    res.json({ message: 'Booking cancelled', booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
