const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Resource = require('../models/Resource');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');

const router = express.Router();
const doctorProfileDetails = (resource) => {
  if (!resource) return null;
  const { _id, name, type, description, slotDurationMinutes, ...details } = resource;
  return {
    _id,
    name,
    specialty: type,
    description,
    slotDurationMinutes,
    ...details,
  };
};

router.use(protect, admin);

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['user', 'patient', 'doctor'] } })
      .select('name email role accountStatus createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();
    const userIds = users.map((user) => user._id);
    const doctorAccountIds = new Set(
      users.filter((user) => user.role === 'doctor').map((user) => user._id.toString())
    );
    const [resources, bookingCounts] = await Promise.all([
      Resource.find()
        .lean(),
      Booking.aggregate([
        { $match: { user: { $in: userIds } } },
        { $group: { _id: '$user', total: { $sum: 1 }, confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } },
      ]),
    ]);
    const resourcesByOwner = new Map();
    for (const resource of resources) {
      const ownerId = resource.createdBy?.toString();
      if (!ownerId || !doctorAccountIds.has(ownerId)) continue;
      const ownedResources = resourcesByOwner.get(ownerId) || [];
      ownedResources.push(resource);
      resourcesByOwner.set(ownerId, ownedResources);
    }
    const countsByUser = new Map(bookingCounts.map((count) => [count._id.toString(), count]));
    const linkedDoctorResourceIds = new Set();
    const accounts = users.map((user) => {
      const resource = resourcesByOwner.get(user._id.toString())?.[0];
      if (resource) linkedDoctorResourceIds.add(resource._id.toString());
      const counts = countsByUser.get(user._id.toString());
      return {
        ...user,
        accountStatus: user.accountStatus || 'active',
        doctorProfile: doctorProfileDetails(resource),
        bookings: counts ? { total: counts.total, confirmed: counts.confirmed, cancelled: counts.cancelled } : { total: 0, confirmed: 0, cancelled: 0 },
      };
    });

    const unlinkedDoctorResources = resources.filter(
      (resource) => !linkedDoctorResourceIds.has(resource._id.toString())
    );
    const resourceBookingCounts = await Booking.aggregate([
      { $match: { resource: { $in: unlinkedDoctorResources.map((resource) => resource._id) } } },
      {
        $group: {
          _id: '$resource',
          total: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
    ]);
    const countsByResource = new Map(resourceBookingCounts.map((count) => [count._id.toString(), count]));
    const resourceAccounts = unlinkedDoctorResources.map((resource) => {
      const counts = countsByResource.get(resource._id.toString());
      return {
        _id: resource._id,
        name: resource.name,
        email: null,
        role: 'doctor',
        accountStatus: 'managed',
        isResourceOnly: true,
        createdAt: resource.createdAt,
        doctorProfile: doctorProfileDetails(resource),
        bookings: counts ? { total: counts.total, confirmed: counts.confirmed, cancelled: counts.cancelled } : { total: 0, confirmed: 0, cancelled: 0 },
      };
    });

    res.json([...accounts, ...resourceAccounts].sort(
      (first, second) => new Date(second.createdAt) - new Date(first.createdAt)
    ));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/users/:id/status', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'A valid user ID is required' });
    }
    const { accountStatus } = req.body;
    if (!['active', 'suspended', 'blocked'].includes(accountStatus)) {
      return res.status(400).json({ message: 'accountStatus must be active, suspended, or blocked' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $in: ['user', 'patient', 'doctor'] } },
      { $set: { accountStatus } },
      { new: true, runValidators: true }
    ).select('name email role accountStatus');
    if (!user) return res.status(404).json({ message: 'Patient or doctor account not found' });
    res.json({ message: `Account ${accountStatus}`, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find()
      .select('-patientDetails')
      .populate('user', 'name email role accountStatus')
      .populate('resource', 'name type createdBy')
      .sort({ startTime: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/bookings/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'A valid booking ID is required' });
    }
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: 'confirmed' },
      { $set: { status: 'cancelled' } },
      { new: true }
    ).select('-patientDetails');
    if (!booking) {
      const existing = await Booking.exists({ _id: req.params.id });
      return res.status(existing ? 409 : 404).json({
        message: existing ? 'This booking is already cancelled' : 'Booking not found',
      });
    }
    res.json({ message: 'Booking cancelled by administrator', booking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/resources/:id/reviews', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'A valid doctor profile ID is required' });
    const resource = await Resource.findById(req.params.id).select('_id');
    if (!resource) return res.status(404).json({ message: 'Doctor profile not found' });
    const reviewerName = typeof req.body.reviewerName === 'string' ? req.body.reviewerName.trim() : '';
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
    const rating = Number(req.body.rating);
    if (!reviewerName || reviewerName.length > 100 || !comment || comment.length > 2000 ||
        !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Provide a reviewer name, a rating from 1 to 5, and a review of up to 2000 characters' });
    }
    const review = await Review.create({
      resource: resource._id,
      reviewerName,
      rating,
      comment,
      source: 'admin',
    });
    res.status(201).json({ message: 'Historical review added', review });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'A valid review ID is required' });
    const review = await Review.findOneAndDelete({ _id: req.params.id, source: 'admin' });
    if (!review) return res.status(404).json({ message: 'Admin-managed review not found' });
    res.json({ message: 'Historical review removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
