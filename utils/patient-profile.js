const isValidDateOfBirth = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' &&
    parsed <= new Date();
};

const getAge = (dateOfBirth, today = new Date()) => {
  if (!isValidDateOfBirth(dateOfBirth)) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayHasPassed =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
};

const normalizePatientProfile = (input) => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const dateOfBirth = input.dateOfBirth;
  const gender = typeof input.gender === 'string' ? input.gender.trim() : '';
  const mobileNumber = typeof input.mobileNumber === 'string' ? input.mobileNumber.trim() : '';
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const city = typeof input.city === 'string' ? input.city.trim() : '';
  const state = typeof input.state === 'string' ? input.state.trim() : '';
  if (input.currentHealthProblem !== undefined && typeof input.currentHealthProblem !== 'string') {
    return { error: 'Current health problem must be text' };
  }
  const currentHealthProblem = typeof input.currentHealthProblem === 'string'
    ? input.currentHealthProblem.trim()
    : '';

  if (!name || name.length > 100) return { error: 'Full name is required and must be 100 characters or fewer' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: 'Enter a valid email address' };
  }
  if (!isValidDateOfBirth(dateOfBirth)) {
    return { error: 'Enter a valid date of birth between 1900 and today' };
  }
  if (!['Male', 'Female', 'Other', 'Prefer not to say'].includes(gender)) {
    return { error: 'Select a valid gender option' };
  }
  const mobileDigits = mobileNumber.replace(/\D/g, '');
  if (!/^\+?[0-9][0-9\s()-]{7,19}$/.test(mobileNumber) ||
      mobileDigits.length < 8 || mobileDigits.length > 15) {
    return { error: 'Enter a valid mobile number with 8 to 15 digits' };
  }
  if (!address || address.length > 300) return { error: 'Address is required and must be 300 characters or fewer' };
  if (!city || city.length > 100) return { error: 'City is required and must be 100 characters or fewer' };
  if (!state || state.length > 100) return { error: 'State is required and must be 100 characters or fewer' };
  if (currentHealthProblem.length > 4000) {
    return { error: 'Current health problem must be 4000 characters or fewer' };
  }

  return {
    value: {
      name,
      email,
      dateOfBirth,
      gender,
      mobileNumber,
      address,
      city,
      state,
      currentHealthProblem,
    },
  };
};

module.exports = { getAge, isValidDateOfBirth, normalizePatientProfile };
