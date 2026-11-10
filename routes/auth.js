const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Resource = require('../models/Resource');
const { protect } = require('../middleware/auth');
const { normalizeDoctorProfile } = require('../utils/doctor-profile');
const { getAge, normalizePatientProfile } = require('../utils/patient-profile');

const router = express.Router();

const userProfile = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus || 'active',
  dateOfBirth: user.dateOfBirth || '',
  age: getAge(user.dateOfBirth),
  gender: user.gender || '',
  mobileNumber: user.mobileNumber || '',
  address: user.address || '',
  city: user.city || '',
  state: user.state || '',
  currentHealthProblem: user.currentHealthProblem || '',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, accountType } = req.body;
    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || !password
    ) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (accountType !== undefined && !['patient', 'doctor'].includes(accountType)) {
      return res.status(400).json({ message: 'accountType must be patient or doctor' });
    }
    let doctorProfile;
    let patientProfile;
    if (accountType === 'doctor') {
      const profile = normalizeDoctorProfile({
        ...req.body,
        name,
        type: req.body.type || req.body.specialty,
      });
      if (profile.error) return res.status(400).json({ message: profile.error });
      doctorProfile = profile.value;
    } else if (accountType === 'patient') {
      const profile = normalizePatientProfile({ ...req.body, name, email });
      if (profile.error) return res.status(400).json({ message: profile.error });
      patientProfile = profile.value;
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const role = accountType === 'doctor' ? 'doctor' : accountType === 'patient' ? 'patient' : 'user';
    const user = await User.create({ ...(patientProfile || {}), name, email, password, role });
    if (role === 'doctor') {
      try {
        await Resource.create({
          ...doctorProfile,
          createdBy: user._id,
        });
      } catch (error) {
        await User.findByIdAndDelete(user._id);
        throw error;
      }
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus || 'active',
      dateOfBirth: user.dateOfBirth || '',
      age: getAge(user.dateOfBirth),
      gender: user.gender || '',
      mobileNumber: user.mobileNumber || '',
      address: user.address || '',
      city: user.city || '',
      state: user.state || '',
      currentHealthProblem: user.currentHealthProblem || '',
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.accountStatus === 'suspended' || user.accountStatus === 'blocked') {
      return res.status(403).json({
        message: user.accountStatus === 'blocked'
          ? 'This account has been blocked. Contact an administrator.'
          : 'This account is suspended. Contact an administrator.',
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus || 'active',
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me — get the signed-in user's profile
router.get('/me', protect, (req, res) => {
  res.json(userProfile(req.user));
});

router.patch('/me', protect, async (req, res) => {
  if (!['patient', 'user'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only patient accounts can update patient details' });
  }
  const profile = normalizePatientProfile(req.body);
  if (profile.error) return res.status(400).json({ message: profile.error });

  try {
    const existingEmail = await User.findOne({
      email: profile.value.email,
      _id: { $ne: req.user._id },
    }).select('_id');
    if (existingEmail) return res.status(409).json({ message: 'Email address is already in use' });
    const patientUpdates = { ...profile.value };
    if (req.body.currentHealthProblem === undefined) {
      delete patientUpdates.currentHealthProblem;
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: patientUpdates },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: 'Patient account not found' });
    res.json(userProfile(user));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Email address is already in use' });
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
