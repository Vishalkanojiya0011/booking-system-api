const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const Resource = require('../models/Resource');
const User = require('../models/User');
const Review = require('../models/Review');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { generateSlots, isValidDate, isWithinClinicHours } = require('../utils/slots');
const { normalizeDoctorProfile } = require('../utils/doctor-profile');

const router = express.Router();

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 20;
const uploadDirectory = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const photosUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
      const extension = file.mimetype === 'image/jpeg' ? '.jpg' :
        file.mimetype === 'image/png' ? '.png' :
          file.mimetype === 'image/webp' ? '.webp' : '.gif';
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Photos must be JPEG, PNG, WebP, or GIF images'));
    }
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 9 },
}).fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'clinicPhotos', maxCount: 8 },
]);

const deleteUploadedFiles = (files = {}) => {
  for (const file of Object.values(files).flat()) {
    fs.unlink(file.path, (error) => {
      if (error && error.code !== 'ENOENT') console.error('Could not remove uploaded photo:', error);
    });
  }
};

const runPhotoUpload = (req, res, next) => {
  photosUpload(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message });
    next();
  });
};

const verifyPhotoUploads = async (req, res, next) => {
  const files = Object.values(req.files || {}).flat();
  try {
    for (const file of files) {
      const signature = Buffer.alloc(12);
      const handle = await fs.promises.open(file.path, 'r');
      try {
        await handle.read(signature, 0, signature.length, 0);
      } finally {
        await handle.close();
      }
      const validSignature =
        (file.mimetype === 'image/jpeg' && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) ||
        (file.mimetype === 'image/png' && signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (file.mimetype === 'image/gif' && ['GIF87a', 'GIF89a'].includes(signature.toString('ascii', 0, 6))) ||
        (file.mimetype === 'image/webp' && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP');
      if (!validSignature) {
        deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'One or more uploads are not valid image files' });
      }
    }
    next();
  } catch (error) {
    deleteUploadedFiles(req.files);
    res.status(500).json({ message: `Could not validate uploaded photos: ${error.message}` });
  }
};

const photoPaths = (files = {}) => Object.values(files).flat().map((file) => `/uploads/${file.filename}`);
const dayForDate = (date) => new Date(`${date}T00:00:00.000Z`)
  .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const isResourceAvailableOn = (resource, date) => resource.availableDays.includes(dayForDate(date));
const toClockTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const getRequestedAvailability = (resource, startHour, endHour) => ({
  start: toClockTime(Math.max(Number(startHour) * 60, Number(resource.availableStartTime.split(':')[0]) * 60 + Number(resource.availableStartTime.split(':')[1]))),
  end: toClockTime(Math.min(Number(endHour) * 60, Number(resource.availableEndTime.split(':')[0]) * 60 + Number(resource.availableEndTime.split(':')[1]))),
});

const getTodayInAppointmentTimeZone = () => {
  const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const getBookableResourceFilter = async () => {
  const activeOwners = await User.find({
    role: { $in: ['doctor', 'admin'] },
    accountStatus: { $nin: ['suspended', 'blocked'] },
  }).distinct('_id');
  return {
    $or: [
      { createdBy: { $exists: false } },
      { createdBy: null },
      { createdBy: { $in: activeOwners } },
    ],
  };
};

// POST /api/resources  (admin only) — add a bookable resource
router.post('/', protect, admin, async (req, res) => {
  try {
    const profile = normalizeDoctorProfile(req.body);
    if (profile.error) return res.status(400).json({ message: profile.error });
    const resource = await Resource.create({
      ...profile.value,
      createdBy: req.user._id,
    });

    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resources — list all resources
router.get('/', async (req, res) => {
  const resources = await Resource.find(await getBookableResourceFilter()).sort({ createdAt: -1 });
  const ratings = await Review.aggregate([
    { $match: { resource: { $in: resources.map((resource) => resource._id) } } },
    { $group: { _id: '$resource', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
  ]);
  const ratingsByResource = new Map(ratings.map((item) => [item._id.toString(), item]));
  res.json(resources.map((resource) => {
    const rating = ratingsByResource.get(resource._id.toString());
    return {
      ...resource.toObject(),
      ratingAverage: rating ? Number(rating.averageRating.toFixed(1)) : 0,
      reviewCount: rating ? rating.reviewCount : 0,
    };
  }));
});

// GET /api/resources/mine — get the signed-in doctor's own profile
router.get('/mine', protect, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Doctor access required' });
  }
  const resource = await Resource.findOne({ createdBy: req.user._id });
  if (!resource) return res.status(404).json({ message: 'Doctor profile not found' });
  res.json(resource);
});

// PATCH /api/resources/mine — update the signed-in doctor's own public profile
router.patch('/mine', protect, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Doctor access required' });
  }

  const profile = normalizeDoctorProfile(req.body);
  if (profile.error) return res.status(400).json({ message: profile.error });
  const resource = await Resource.findOneAndUpdate({ createdBy: req.user._id }, profile.value, {
    new: true,
    runValidators: true,
  });
  if (!resource) return res.status(404).json({ message: 'Doctor profile not found' });
  res.json(resource);
});

router.post('/mine/photos', protect, async (req, res, next) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctor access required' });
  next();
}, runPhotoUpload, verifyPhotoUploads, async (req, res) => {
  try {
    const resource = await Resource.findOne({ createdBy: req.user._id });
    if (!resource) {
      deleteUploadedFiles(req.files);
      return res.status(404).json({ message: 'Doctor profile not found' });
    }
    const uploaded = photoPaths(req.files);
    if (!uploaded.length) return res.status(400).json({ message: 'Select a profile photo or clinic photos to upload' });
    if (req.files.profilePhoto?.[0]) {
      resource.profilePhoto = uploaded.find((photo) => photo === `/uploads/${req.files.profilePhoto[0].filename}`);
    }
    const clinicPhotos = req.files.clinicPhotos || [];
    if (resource.clinicPhotos.length + clinicPhotos.length > 12) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'A doctor profile can have at most 12 clinic photos' });
    }
    resource.clinicPhotos.push(...clinicPhotos.map((file) => `/uploads/${file.filename}`));
    await resource.save();
    res.json({
      message: 'Doctor photos updated',
      profilePhoto: resource.profilePhoto,
      clinicPhotos: resource.clinicPhotos,
    });
  } catch (error) {
    deleteUploadedFiles(req.files);
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/photos', protect, admin, runPhotoUpload, verifyPhotoUploads, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      deleteUploadedFiles(req.files);
      return res.status(404).json({ message: 'Doctor profile not found' });
    }
    const uploaded = photoPaths(req.files);
    if (!uploaded.length) return res.status(400).json({ message: 'Select a profile photo or clinic photos to upload' });
    if (req.files.profilePhoto?.[0]) {
      resource.profilePhoto = `/uploads/${req.files.profilePhoto[0].filename}`;
    }
    const clinicPhotos = req.files.clinicPhotos || [];
    if (resource.clinicPhotos.length + clinicPhotos.length > 12) {
      deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'A doctor profile can have at most 12 clinic photos' });
    }
    resource.clinicPhotos.push(...clinicPhotos.map((file) => `/uploads/${file.filename}`));
    await resource.save();
    res.json({ message: 'Doctor photos updated', profilePhoto: resource.profilePhoto, clinicPhotos: resource.clinicPhotos });
  } catch (error) {
    deleteUploadedFiles(req.files);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/reviews', async (req, res) => {
  try {
    if (!await Resource.exists({ _id: req.params.id })) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }
    const reviews = await Review.find({ resource: req.params.id })
      .select('reviewerName rating comment source createdAt')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/next-slot', async (req, res) => {
  try {
    const resource = await Resource.findOne({
      _id: req.params.id,
      ...await getBookableResourceFilter(),
    });
    if (!resource) return res.status(404).json({ message: 'Doctor not found' });

    const startDate = getTodayInAppointmentTimeZone();
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const availableDays = new Set(resource.availableDays);
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
      const dayName = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      if (!availableDays.has(dayName)) continue;
      let slots = await Slot.find({ resource: resource._id, date }).sort({ startTime: 1 });
      if (!slots.length) {
        const generated = generateSlots(resource, date, resource.availableStartTime, resource.availableEndTime);
        if (generated.length) {
          try {
            await Slot.insertMany(generated, { ordered: false });
          } catch (error) {
            if (error.code !== 11000 && !error.writeErrors?.every((item) => item.code === 11000)) throw error;
          }
        }
        slots = await Slot.find({ resource: resource._id, date }).sort({ startTime: 1 });
      }
      const booked = new Set((await Booking.find({
        resource: resource._id,
        status: 'confirmed',
        slot: { $in: slots.map((slot) => slot._id) },
      }).select('slot')).map((booking) => booking.slot.toString()));
      const next = slots.find((slot) =>
        slot.startTime > new Date() &&
        !booked.has(slot._id.toString()) &&
        isWithinClinicHours(slot, resource.availableStartTime, resource.availableEndTime)
      );
      if (next) return res.json({ date, startTime: next.startTime, endTime: next.endTime });
    }
    res.json(null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/resources/slots (admin only) — generate appointment slots for every doctor
router.post('/slots', protect, admin, async (req, res) => {
  try {
    const { date, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR } = req.body;
    if (!date) return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'date must be a valid YYYY-MM-DD date' });
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
      return res.status(400).json({ message: 'startHour and endHour must define a valid range from 0 to 24' });
    }

    const resources = await Resource.find(await getBookableResourceFilter());
    let generated = 0;
    let alreadyScheduled = 0;
    let availableDoctorCount = 0;

    for (const resource of resources) {
      if (!isResourceAvailableOn(resource, date)) continue;
      availableDoctorCount += 1;
      const { start, end } = getRequestedAvailability(resource, startHour, endHour);
      if (start >= end) continue;
      const slotsToCreate = generateSlots(resource, date, start, end);

      const startTimes = slotsToCreate.map((slot) => slot.startTime);
      const existingCount = await Slot.countDocuments({
        resource: resource._id,
        date,
        startTime: { $in: startTimes },
      });

      try {
        await Slot.insertMany(slotsToCreate, { ordered: false });
      } catch (error) {
        const writeErrors = error.writeErrors || [];
        const isDuplicateOnly = error.code === 11000 ||
          (writeErrors.length > 0 && writeErrors.every((writeError) => writeError.code === 11000));
        if (!isDuplicateOnly) throw error;
      }

      const scheduledCount = await Slot.countDocuments({
        resource: resource._id,
        date,
        startTime: { $in: startTimes },
      });
      generated += scheduledCount - existingCount;
      alreadyScheduled += slotsToCreate.length - (scheduledCount - existingCount);
    }

    res.status(201).json({
      message: `Appointment times created for ${availableDoctorCount} available doctors on ${date}`,
      doctorCount: availableDoctorCount,
      generated,
      alreadyScheduled,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/resources/:id/slots — admins or the resource's doctor can generate slots
// body: { date: '2026-11-10', startHour: 9, endHour: 20 }
router.post('/:id/slots', protect, async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: 'Resource not found' });
    const ownsResource = req.user.role === 'doctor' &&
      resource.createdBy && resource.createdBy.toString() === req.user._id.toString();
    if (req.user.role !== 'admin' && !ownsResource) {
      return res.status(403).json({ message: 'Only an administrator or this doctor can manage the schedule' });
    }

    const { date, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR } = req.body;
    if (!date) return res.status(400).json({ message: 'date (YYYY-MM-DD) is required' });
    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'date must be a valid YYYY-MM-DD date' });
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
      return res.status(400).json({ message: 'startHour and endHour must define a valid range from 0 to 24' });
    }
    if (!isResourceAvailableOn(resource, date)) {
      return res.status(400).json({ message: `This doctor is not available on ${dayForDate(date)}` });
    }
    const { start, end } = getRequestedAvailability(resource, startHour, endHour);
    if (start >= end) {
      return res.status(400).json({ message: 'The requested schedule does not overlap this doctor’s available hours' });
    }
    const slotsToCreate = generateSlots(resource, date, start, end);

    // ordered: false so duplicate slots (if any already exist) are skipped,
    // not treated as a fatal error for the whole batch
    const created = await Slot.insertMany(slotsToCreate, { ordered: false }).catch((e) => e.insertedDocs || []);

    res.status(201).json({ message: `Generated slots for ${date}`, count: created.length || slotsToCreate.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resources/:id/slots?date=YYYY-MM-DD — list FREE slots for a date
router.get('/:id/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query param (YYYY-MM-DD) is required' });
    if (!isValidDate(date)) return res.status(400).json({ message: 'date must be a valid YYYY-MM-DD date' });
    if (date < getTodayInAppointmentTimeZone()) {
      return res.status(400).json({ message: 'Appointments can only be viewed for today or a future date' });
    }

    const resource = await Resource.findOne({
      _id: req.params.id,
      ...await getBookableResourceFilter(),
    });
    if (!resource) return res.status(404).json({ message: 'Doctor not found' });
    if (!isResourceAvailableOn(resource, date)) return res.json([]);

    let allSlots = await Slot.find({ resource: resource._id, date }).sort({ startTime: 1 });
    if (!allSlots.length) {
      const slotsToCreate = generateSlots(resource, date, resource.availableStartTime, resource.availableEndTime);
      if (slotsToCreate.length) {
        await Slot.insertMany(slotsToCreate, { ordered: false }).catch((error) => {
          const writeErrors = error.writeErrors || [];
          const duplicateOnly = error.code === 11000 ||
            (writeErrors.length > 0 && writeErrors.every((writeError) => writeError.code === 11000));
          if (!duplicateOnly) {
            throw error;
          }
        });
      }
      allSlots = await Slot.find({ resource: resource._id, date }).sort({ startTime: 1 });
    }

    const clinicSlots = allSlots.filter((slot) =>
      isWithinClinicHours(slot, resource.availableStartTime, resource.availableEndTime)
    );

    const bookedSlotIds = new Set(
      (
        await Booking.find({
          resource: resource._id,
          status: 'confirmed',
          slot: { $in: clinicSlots.map((s) => s._id) },
        }).select('slot')
      ).map((b) => b.slot.toString())
    );

    const now = new Date();
    const freeSlots = clinicSlots.filter((slot) =>
      slot.startTime > now && !bookedSlotIds.has(slot._id.toString())
    );

    res.json(freeSlots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
