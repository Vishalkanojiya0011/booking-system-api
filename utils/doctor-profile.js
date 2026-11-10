const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CONSULTATION_TYPES = ['Online', 'Offline'];

const splitList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
};

const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const normalizeDoctorProfile = (input) => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const type = typeof input.type === 'string'
    ? input.type.trim()
    : typeof input.specialization === 'string' ? input.specialization.trim() : '';
  const slotDurationMinutes = Number(input.slotDurationMinutes);
  const experienceYears = Number(input.experienceYears ?? 0);
  const consultationFee = Number(input.consultationFee ?? 0);
  const totalPatientsTreatedEstimate = Number(input.totalPatientsTreatedEstimate ?? 0);
  const availableDays = input.availableDays === undefined
    ? [...DAYS_OF_WEEK.slice(0, 6)]
    : splitList(input.availableDays);
  const languages = splitList(input.languages);
  const consultationTypes = input.consultationTypes === undefined
    ? ['Offline']
    : splitList(input.consultationTypes);
  const awardsAndAchievements = splitList(input.awardsAndAchievements);
  const startTime = input.availableStartTime || '09:00';
  const endTime = input.availableEndTime || '20:00';

  if (!name || !type) return { error: 'Doctor name and specialization are required' };
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 5 || slotDurationMinutes > 480) {
    return { error: 'Appointment duration must be from 5 to 480 minutes' };
  }
  if (!Number.isFinite(experienceYears) || experienceYears < 0 || !Number.isInteger(experienceYears)) {
    return { error: 'Experience must be a non-negative whole number of years' };
  }
  if (!Number.isFinite(consultationFee) || consultationFee < 0) {
    return { error: 'Consultation fee must be a non-negative amount' };
  }
  if (!Number.isFinite(totalPatientsTreatedEstimate) || totalPatientsTreatedEstimate < 0 ||
      !Number.isInteger(totalPatientsTreatedEstimate)) {
    return { error: 'Patients treated must be a non-negative whole number estimate' };
  }
  if (input.gender && !['Male', 'Female', 'Other'].includes(input.gender)) {
    return { error: 'Gender must be Male, Female, or Other' };
  }
  if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
    return { error: 'Available start and end times must be valid and start before end' };
  }
  if (startTime < '09:00' || endTime > '20:00') {
    return { error: 'Doctor availability must be within clinic hours (9 AM–8 PM)' };
  }
  if (!availableDays.length || availableDays.some((day) => !DAYS_OF_WEEK.includes(day))) {
    return { error: 'Select at least one valid available day' };
  }
  if (consultationTypes.some((type) => !CONSULTATION_TYPES.includes(type))) {
    return { error: 'Consultation types can only be Online or Offline' };
  }
  if (languages.length > 20 || awardsAndAchievements.length > 50) {
    return { error: 'Too many languages or awards were provided' };
  }
  for (const field of ['qualification', 'registrationNumber', 'description', 'clinicName', 'clinicAddress']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      return { error: `${field} must be a string` };
    }
  }
  if ([name, type, input.qualification, input.registrationNumber, input.description, input.clinicName, input.clinicAddress]
    .some((value) => typeof value === 'string' && value.length > 2000)) {
    return { error: 'Doctor profile text fields must be 2000 characters or fewer' };
  }
  if (languages.some((language) => language.length > 50) ||
      awardsAndAchievements.some((award) => award.length > 200)) {
    return { error: 'Each language must be 50 characters or fewer and each award 200 characters or fewer' };
  }

  return {
    value: {
      name,
      type,
      description: (input.description || '').trim(),
      slotDurationMinutes,
      qualification: (input.qualification || '').trim(),
      experienceYears,
      registrationNumber: (input.registrationNumber || '').trim(),
      gender: input.gender || '',
      languages,
      consultationFee,
      availableDays,
      availableStartTime: startTime,
      availableEndTime: endTime,
      consultationTypes,
      clinicName: (input.clinicName || '').trim(),
      clinicAddress: (input.clinicAddress || '').trim(),
      totalPatientsTreatedEstimate,
      awardsAndAchievements,
    },
  };
};

module.exports = { DAYS_OF_WEEK, CONSULTATION_TYPES, normalizeDoctorProfile, validTime };
