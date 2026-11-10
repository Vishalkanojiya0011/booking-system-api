const TOKEN_KEY = 'gather_token';
const USER_KEY = 'gather_user';
localStorage.removeItem(TOKEN_KEY);
localStorage.removeItem(USER_KEY);
const resourceList = document.querySelector('#resource-list');
const bookingList = document.querySelector('#booking-list');
const profileCard = document.querySelector('#profile-card');
const notice = document.querySelector('#notice');
const authDialog = document.querySelector('#auth-dialog');
const slotsDialog = document.querySelector('#slots-dialog');
const authForm = document.querySelector('#auth-form');
const authNameField = document.querySelector('#name-field');
const authTitle = document.querySelector('#auth-title');
const authDescription = document.querySelector('#auth-description');
const authSubmit = document.querySelector('#auth-submit');
const authSwitchPrompt = document.querySelector('#auth-switch-prompt');
const authSwitch = document.querySelector('#auth-switch');
const authError = document.querySelector('#auth-error');
const doctorDetailsDialog = document.querySelector('#doctor-details-dialog');
const doctorDetailsContent = document.querySelector('#doctor-details-content');
const accountTypeField = document.querySelector('#account-type-field');
const doctorRegistrationFields = document.querySelector('#doctor-registration-fields');
const patientRegistrationFields = document.querySelector('#patient-registration-fields');
const slotDate = document.querySelector('#slot-date');
const slotList = document.querySelector('#slot-list');
const bookingPatientStatus = document.querySelector('#booking-patient-status');
const bookingPatientSummary = document.querySelector('#booking-patient-summary');
const bookingHealthProblem = document.querySelector('#booking-health-problem');
const bookingCompleteProfile = document.querySelector('#booking-complete-profile');
const doctorQuery = document.querySelector('#doctor-query');
const specialtyFilter = document.querySelector('#specialty-filter');
const specialtyChips = document.querySelector('#specialty-chips');
const bookAppointmentButton = document.querySelector('#book-appointment-button');
const slotSelectionMessage = document.querySelector('#slot-selection-message');
const confirmationToast = document.querySelector('#confirmation-toast');
let isRegistering = false;
let selectedResource = null;
let selectedSlotId = '';
let bookingPatientReady = false;
let reopenSlotsAfterAuth = false;
let confirmationToastTimeout;
let resources = [];
let selectedSpecialty = '';
let userBookings = [];
let adminAccounts = [];
let activeAdminAccountType = 'patient';
const doctorPhotos = [
  'photo-1559839734-2b71ea197ec2',
  'photo-1612349317150-e413f6a5b16d',
  'photo-1594824476967-48c8b964273f',
  'photo-1622253692010-333f2da6031d',
];

function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  } catch (error) {
    showNotice('Your saved sign-in information could not be read. Please sign in again.', true);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.classList.remove('hidden');
}

function clearNotice() {
  notice.textContent = '';
  notice.classList.add('hidden');
  notice.classList.remove('error');
}

function showConfirmationToast(title, message) {
  document.querySelector('#confirmation-toast-title').textContent = title;
  document.querySelector('#confirmation-toast-message').textContent = message;
  confirmationToast.classList.add('visible');
  window.clearTimeout(confirmationToastTimeout);
  confirmationToastTimeout = window.setTimeout(() => {
    confirmationToast.classList.remove('visible');
  }, 8000);
}

async function api(url, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (error) {
    throw new Error('Could not connect to Carely. Make sure the server is running and try again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return new Date(value).toLocaleDateString(undefined, options);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

const doctorProfileFields = [
  'name', 'specialty', 'type', 'description', 'slotDurationMinutes', 'qualification',
  'experienceYears', 'registrationNumber', 'gender', 'languages', 'consultationFee',
  'availableDays', 'availableStartTime', 'availableEndTime', 'consultationTypes',
  'clinicName', 'clinicAddress', 'totalPatientsTreatedEstimate', 'awardsAndAchievements',
];

function doctorProfilePayload(formData) {
  const body = {};
  for (const field of doctorProfileFields) {
    if (formData.has(field)) body[field] = formData.get(field);
  }
  if (!body.type && body.specialty) body.type = body.specialty;
  delete body.specialty;
  if (formData.has('doctorGender')) body.gender = formData.get('doctorGender');
  for (const field of ['slotDurationMinutes', 'experienceYears', 'consultationFee', 'totalPatientsTreatedEstimate']) {
    if (field in body) body[field] = Number(body[field]);
  }
  return body;
}

function hasDoctorPhotos(formData) {
  return ['profilePhoto', 'clinicPhotos'].some((field) => formData.getAll(field).some((file) => file instanceof File && file.size));
}

async function uploadDoctorPhotos(formData, endpoint) {
  if (!hasDoctorPhotos(formData)) return;
  const photos = new FormData();
  for (const field of ['profilePhoto', 'clinicPhotos']) {
    for (const file of formData.getAll(field)) {
      if (file instanceof File && file.size) photos.append(field, file);
    }
  }
  return api(endpoint, { method: 'POST', body: photos });
}

function updateHeader() {
  const user = getUser();
  const isDoctor = user?.role === 'doctor';
  document.querySelector('#auth-button').classList.toggle('hidden', Boolean(user));
  document.querySelector('#sign-out-button').classList.toggle('hidden', !user);
  document.querySelector('#profile-button').classList.toggle('hidden', !user);
  document.querySelector('#user-greeting').classList.toggle('hidden', !user);
  document.querySelector('#user-greeting').textContent = user ? `Hi, ${user.name.split(' ')[0]}` : '';
  document.querySelector('#bookings-nav').classList.toggle('hidden', !user || isDoctor);
  document.querySelector('#doctor-dashboard-nav').classList.toggle('hidden', !isDoctor);
  document.querySelector('#find-doctor-nav').classList.toggle('hidden', isDoctor);
  document.querySelector('#how-it-works-nav').classList.toggle('hidden', isDoctor);
  document.querySelector('#footer-find-doctor').classList.toggle('hidden', isDoctor);
  document.querySelector('#my-bookings').classList.toggle('hidden', !user || isDoctor);
  document.querySelector('#my-profile').classList.toggle('hidden', !user);
  document.querySelector('#admin-section').classList.toggle('hidden', !user || user.role !== 'admin');
  document.querySelector('#doctor-dashboard').classList.toggle('hidden', !isDoctor);
  document.querySelector('#hero').classList.toggle('hidden', isDoctor);
  document.querySelector('#discover').classList.toggle('hidden', isDoctor);
  document.querySelector('#how-it-works').classList.toggle('hidden', isDoctor);
}

function renderResources() {
  const resourceSelect = document.querySelector('#slots-form select[name="resourceId"]');
  if (resourceSelect) {
    const previousValue = resourceSelect.value;
    resourceSelect.innerHTML = '<option value="">Select doctor(s)</option><option value="all">All doctors</option>' + resources.map((resource) =>
      `<option value="${escapeHtml(resource._id)}">${escapeHtml(resource.name)}</option>`
    ).join('');
    if (previousValue === 'all' || resources.some((resource) => resource._id === previousValue)) resourceSelect.value = previousValue;
  }

  const specialties = [...new Set(resources.map((resource) => String(resource.type || '').trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  if (selectedSpecialty && !specialties.includes(selectedSpecialty)) selectedSpecialty = '';
  specialtyFilter.innerHTML = '<option value="">All specialties</option>' + specialties.map((specialty) =>
    `<option value="${escapeHtml(specialty)}">${escapeHtml(specialty)}</option>`
  ).join('');
  specialtyFilter.value = selectedSpecialty;
  specialtyChips.innerHTML = [
    `<button class="specialty-chip${selectedSpecialty ? '' : ' active'}" type="button" data-specialty="">All doctors</button>`,
    ...specialties.map((specialty) =>
      `<button class="specialty-chip${selectedSpecialty === specialty ? ' active' : ''}" type="button" data-specialty="${escapeHtml(specialty)}">${escapeHtml(specialty)}</button>`
    ),
  ].join('');
  filterDoctors();
}

function filterDoctors() {
  const query = doctorQuery.value.trim().toLocaleLowerCase();
  const filtered = resources.filter((resource) => {
    const matchesSpecialty = !selectedSpecialty || resource.type === selectedSpecialty;
    const matchesQuery = !query || `${resource.name} ${resource.type} ${resource.description || ''}`
      .toLocaleLowerCase().includes(query);
    return matchesSpecialty && matchesQuery;
  });

  if (!resources.length) {
    resourceList.innerHTML = '<div class="empty-state">Our care team is getting ready. Please check back soon for available doctors.</div>';
    return;
  }
  if (!filtered.length) {
    resourceList.innerHTML = '<div class="empty-state">No doctors match that search. Try another name or specialty.</div>';
    return;
  }
  resourceList.innerHTML = filtered.map((resource) => {
    const index = resources.indexOf(resource);
    const photo = doctorPhotos[index % doctorPhotos.length];
    const image = resource.profilePhoto || `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=600&h=440&q=80`;
    return `<article class="resource-card doctor-card">
      <div class="doctor-photo-wrap">
        <img class="doctor-photo" src="${escapeHtml(image)}" alt="${escapeHtml(resource.name)}">
        <span class="doctor-photo-badge"><span>✓</span> Appointment booking</span>
      </div>
      <div class="resource-content">
        <div class="resource-meta"><span class="resource-type">${escapeHtml(resource.type || 'General care')}</span><span class="resource-duration">${Number(resource.slotDurationMinutes) || 30} min visit</span></div>
        <h3>${escapeHtml(resource.name)}</h3>
        <p>${escapeHtml(resource.description || 'Here to listen, answer your questions, and support your health.')}</p>
        ${Number(resource.consultationFee) > 0 ? `<div class="doctor-card-fee">Consultation fee · ₹${Number(resource.consultationFee).toLocaleString('en-IN')}</div>` : ''}
        <div class="resource-bottom"><button class="text-button" type="button" data-profile-id="${escapeHtml(resource._id)}">View full profile</button><button class="text-button" type="button" data-resource-id="${escapeHtml(resource._id)}">Book a visit&nbsp; ↗</button></div>
      </div>
    </article>`;
  }).join('');
}

function formattedList(values) {
  return Array.isArray(values) && values.length ? values.map(escapeHtml).join(', ') : 'Not provided';
}

async function openDoctorDetails(resource) {
  doctorDetailsDialog.showModal();
  doctorDetailsContent.innerHTML = '<div class="profile-loading">Loading doctor profile…</div>';
  try {
    const nextSlot = await api(`/api/resources/${encodeURIComponent(resource._id)}/next-slot`);
    const clinicPhotos = Array.isArray(resource.clinicPhotos) ? resource.clinicPhotos : [];
    doctorDetailsContent.innerHTML = `
      <div class="eyebrow">DOCTOR PROFILE</div>
      <h2>${escapeHtml(resource.name)}</h2>
      <p class="doctor-details-specialty">${escapeHtml(resource.type || 'General care')} · ${escapeHtml(resource.qualification || 'Qualification not provided')}</p>
      ${resource.profilePhoto ? `<img class="doctor-details-photo" src="${escapeHtml(resource.profilePhoto)}" alt="${escapeHtml(resource.name)}">` : ''}
      <div class="doctor-details-grid">
        <div><span>Experience</span><strong>${Number(resource.experienceYears) || 0} years</strong></div>
        <div><span>Registration number</span><strong>${escapeHtml(resource.registrationNumber || 'Not provided')}</strong></div>
        <div><span>Gender</span><strong>${escapeHtml(resource.gender || 'Not specified')}</strong></div>
        <div><span>Languages</span><strong>${formattedList(resource.languages)}</strong></div>
        <div><span>Consultation fee</span><strong>₹${Number(resource.consultationFee || 0).toLocaleString('en-IN')}</strong></div>
        <div><span>Appointment duration</span><strong>${Number(resource.slotDurationMinutes) || 30} minutes</strong></div>
        <div><span>Available days</span><strong>${formattedList(resource.availableDays)}</strong></div>
        <div><span>Available time</span><strong>${escapeHtml(resource.availableStartTime || '09:00')}–${escapeHtml(resource.availableEndTime || '20:00')}</strong></div>
        <div><span>Consultation type</span><strong>${formattedList(resource.consultationTypes)}</strong></div>
        <div><span>Next available slot</span><strong>${nextSlot ? `${escapeHtml(formatDate(`${nextSlot.date}T00:00:00`))}, ${escapeHtml(formatTime(nextSlot.startTime))}` : 'No upcoming time available'}</strong></div>
        <div><span>Hospital / clinic</span><strong>${escapeHtml(resource.clinicName || 'Not provided')}</strong></div>
        <div><span>Patients treated (estimate)</span><strong>${Number(resource.totalPatientsTreatedEstimate || 0).toLocaleString('en-IN')}</strong></div>
        <div class="doctor-details-wide"><span>Clinic address</span><strong>${escapeHtml(resource.clinicAddress || 'Not provided')}</strong></div>
        <div class="doctor-details-wide"><span>About the doctor</span><strong>${escapeHtml(resource.description || 'No biography provided')}</strong></div>
        <div class="doctor-details-wide"><span>Awards & achievements</span><strong>${formattedList(resource.awardsAndAchievements)}</strong></div>
      </div>
      ${clinicPhotos.length ? `<h3>Clinic photos</h3><div class="clinic-photo-gallery">${clinicPhotos.map((photo) => `<img src="${escapeHtml(photo)}" alt="Clinic photo">`).join('')}</div>` : ''}
      <button class="button button-dark doctor-details-book" type="button" data-detail-book="${escapeHtml(resource._id)}">Book a visit <span aria-hidden="true">↗</span></button>`;
  } catch (error) {
    doctorDetailsContent.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadResources() {
  resourceList.innerHTML = '<div class="loading-card">Finding doctors for you<span class="loading-dots">...</span></div>';
  try {
    resources = await api('/api/resources');
    renderResources();
  } catch (error) {
    resourceList.innerHTML = '<div class="empty-state">Spaces could not be loaded.</div>';
    showNotice(error.message, true);
  }
}

async function loadBookings() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return;
  try {
    const bookings = await api('/api/bookings/me');
    userBookings = bookings;
    renderProfileAppointments(bookings);
    if (!bookings.length) {
      bookingList.innerHTML = '<div class="empty-state">No appointments booked yet. Find a doctor above to choose a time.</div>';
      return;
    }
    bookingList.innerHTML = bookings.map((booking) => {
      const resource = booking.resource && typeof booking.resource === 'object' ? booking.resource : null;
      return `<article class="booking-card">
        <div><h3>${escapeHtml(resource?.name || 'Your doctor')}</h3><span class="booking-status">${escapeHtml(booking.status || 'confirmed')}</span></div>
        <p class="booking-time">${escapeHtml(formatDate(booking.startTime))} · ${escapeHtml(formatTime(booking.startTime))}–${escapeHtml(formatTime(booking.endTime))}</p>
        ${booking.status === 'confirmed' ? `<div class="booking-actions">${booking.confirmationEmailSent ? '<span class="email-sent-label">✓ Email sent</span>' : `<button class="text-button resend-confirmation" type="button" data-booking-id="${escapeHtml(booking._id)}">Send confirmation email</button>`}<button class="button button-outline cancel-booking" type="button" data-booking-id="${escapeHtml(booking._id)}">Cancel</button></div>` : ''}
      </article>`;
    }).join('');
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      userBookings = [];
      bookingList.innerHTML = '';
      profileCard.innerHTML = '<div class="empty-state">Please log in again to view your profile.</div>';
      updateHeader();
      showNotice('Your session expired. Please sign in again.');
      return;
    }
    bookingList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderProfileAppointments(bookings) {
  const appointmentCount = bookings.filter((booking) => booking.status === 'confirmed').length;
  const cancelledCount = bookings.filter((booking) => booking.status === 'cancelled').length;
  const appointmentsValue = document.querySelector('#profile-appointments-value');
  const cancelledValue = document.querySelector('#profile-cancelled-value');
  if (appointmentsValue) appointmentsValue.textContent = String(appointmentCount);
  if (cancelledValue) cancelledValue.textContent = String(cancelledCount);
}

async function loadAdminPortal() {
  if (getUser()?.role !== 'admin') return;
  const accountList = document.querySelector('#admin-account-list');
  const bookingAdminList = document.querySelector('#admin-booking-list');
  accountList.innerHTML = `<div class="profile-loading">Loading ${activeAdminAccountType} accounts…</div>`;
  bookingAdminList.innerHTML = '<div class="profile-loading">Loading appointments…</div>';
  try {
    const [users, bookings] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/bookings'),
    ]);
    adminAccounts = users;
    renderAdminAccounts();

    bookingAdminList.innerHTML = bookings.length ? bookings.map((booking) => {
      const patient = booking.user && typeof booking.user === 'object' ? booking.user : null;
      const doctor = booking.resource && typeof booking.resource === 'object' ? booking.resource : null;
      return `<article class="booking-card admin-booking-card">
        <div><h3>${escapeHtml(patient?.name || 'Unknown patient')}</h3><p>${escapeHtml(patient?.email || 'Patient account unavailable')}</p><span class="booking-status">${escapeHtml(booking.status)}</span></div>
        <div class="admin-booking-doctor"><strong>${escapeHtml(doctor?.name || 'Unknown doctor')}</strong><span>${escapeHtml(doctor?.type || '')}</span><p>${escapeHtml(formatDate(booking.startTime))} · ${escapeHtml(formatTime(booking.startTime))}–${escapeHtml(formatTime(booking.endTime))}</p></div>
        ${booking.status === 'confirmed' ? `<div class="booking-actions"><button class="button button-danger-outline admin-cancel-booking" type="button" data-booking-id="${escapeHtml(booking._id)}">Cancel booking</button></div>` : ''}
      </article>`;
    }).join('') : '<div class="empty-state">There are no appointments yet.</div>';
  } catch (error) {
    accountList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    bookingAdminList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderAdminAccounts() {
  const accountList = document.querySelector('#admin-account-list');
  const patientsTab = document.querySelector('#admin-patients-tab');
  const doctorsTab = document.querySelector('#admin-doctors-tab');
  const isPatientsTab = activeAdminAccountType === 'patient';
  const users = adminAccounts.filter((user) =>
    isPatientsTab ? ['user', 'patient'].includes(user.role) : user.role === 'doctor'
  );
  patientsTab.classList.toggle('active', isPatientsTab);
  patientsTab.setAttribute('aria-selected', String(isPatientsTab));
  doctorsTab.classList.toggle('active', !isPatientsTab);
  doctorsTab.setAttribute('aria-selected', String(!isPatientsTab));
  accountList.setAttribute('aria-labelledby', isPatientsTab ? 'admin-patients-tab' : 'admin-doctors-tab');

  accountList.innerHTML = users.length ? users.map((user) => {
      const doctor = user.doctorProfile;
      const status = user.accountStatus || 'active';
      const email = user.email || 'No doctor login account';
      return `<article class="admin-record-card">
        <div class="admin-record-heading">
          <div><h3>${escapeHtml(user.name)}</h3><span class="booking-status">${isPatientsTab ? 'Patient' : 'Doctor'}</span></div>
          <span class="account-status account-status-${escapeHtml(status)}">${escapeHtml(user.isResourceOnly ? 'Admin-managed listing' : status)}</span>
        </div>
        <div class="admin-record-details">
          <span><strong>Email</strong>${escapeHtml(email)}</span>
          <span><strong>Account ID</strong>${escapeHtml(user._id)}</span>
          <span><strong>Joined</strong>${escapeHtml(formatDate(user.createdAt, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
          <span><strong>Appointments</strong>${user.bookings.total} total · ${user.bookings.confirmed} confirmed · ${user.bookings.cancelled} cancelled</span>
          ${doctor ? `<span><strong>Specialty</strong>${escapeHtml(doctor.specialty)}</span><span><strong>Qualification</strong>${escapeHtml(doctor.qualification || 'Not provided')}</span><span><strong>Experience</strong>${Number(doctor.experienceYears) || 0} years</span><span><strong>Registration</strong>${escapeHtml(doctor.registrationNumber || 'Not provided')}</span><span><strong>Gender</strong>${escapeHtml(doctor.gender || 'Not specified')}</span><span><strong>Languages</strong>${formattedList(doctor.languages)}</span><span><strong>Consultation fee</strong>₹${Number(doctor.consultationFee || 0).toLocaleString('en-IN')}</span><span><strong>Available days</strong>${formattedList(doctor.availableDays)}</span><span><strong>Available time</strong>${escapeHtml(doctor.availableStartTime || '09:00')}–${escapeHtml(doctor.availableEndTime || '20:00')}</span><span><strong>Consultation type</strong>${formattedList(doctor.consultationTypes)}</span><span><strong>Clinic</strong>${escapeHtml(doctor.clinicName || 'Not provided')}</span><span><strong>Clinic address</strong>${escapeHtml(doctor.clinicAddress || 'Not provided')}</span><span><strong>Patients treated (estimate)</strong>${Number(doctor.totalPatientsTreatedEstimate || 0).toLocaleString('en-IN')}</span><span><strong>Awards</strong>${formattedList(doctor.awardsAndAchievements)}</span><span class="admin-record-description"><strong>Profile</strong>${escapeHtml(doctor.description || 'No description provided')}</span>` : ''}
        </div>
        ${user.isResourceOnly ? '' : `<div class="admin-record-actions">
          ${status !== 'suspended' ? `<button class="button button-outline" type="button" data-account-action="suspended" data-user-id="${escapeHtml(user._id)}">Suspend</button>` : ''}
          ${status !== 'blocked' ? `<button class="button button-danger-outline" type="button" data-account-action="blocked" data-user-id="${escapeHtml(user._id)}">Block</button>` : ''}
          ${status !== 'active' ? `<button class="button button-outline" type="button" data-account-action="active" data-user-id="${escapeHtml(user._id)}">${status === 'blocked' ? 'Unblock' : 'Activate'}</button>` : ''}
        </div>`}
      </article>`;
    }).join('') : `<div class="empty-state">${isPatientsTab ? 'No patient accounts have registered yet.' : 'No doctors have been added or registered yet.'}</div>`;
}

async function loadProfile() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return;
  try {
    const user = await api('/api/auth/me');
    sessionStorage.setItem(USER_KEY, JSON.stringify({
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus || 'active',
      id: user._id,
    }));
    updateHeader();
    const initials = user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
    profileCard.innerHTML = `
      <div class="profile-identity">
        <div class="profile-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="profile-identity-copy">
          <span class="profile-label">CARELY MEMBER</span>
          <h3>${escapeHtml(user.name)}</h3>
          <span class="profile-role">${escapeHtml(user.role === 'admin' ? 'Administrator' : user.role === 'doctor' ? 'Doctor account' : 'Patient account')}</span>
        </div>
      </div>
      ${['patient', 'user'].includes(user.role) ? `
        <form id="patient-profile-form" class="patient-profile-form">
          <div class="profile-details patient-profile-grid">
            <label class="profile-detail">Full name<input name="name" maxlength="100" value="${escapeHtml(user.name)}" required></label>
            <label class="profile-detail">Date of birth<input name="dateOfBirth" type="date" min="1900-01-01" max="${localDateString()}" value="${escapeHtml(user.dateOfBirth || '')}" required></label>
            <label class="profile-detail">Age<input name="age" type="number" value="${user.age ?? ''}" readonly aria-label="Age calculated from date of birth"></label>
            <label class="profile-detail">Gender<select name="gender" required>
              <option value="">Select gender</option>
              ${['Female', 'Male', 'Other', 'Prefer not to say'].map((gender) => `<option${user.gender === gender ? ' selected' : ''}>${gender}</option>`).join('')}
            </select></label>
            <label class="profile-detail">Mobile number<input name="mobileNumber" type="tel" autocomplete="tel" value="${escapeHtml(user.mobileNumber || '')}" required></label>
            <label class="profile-detail">Email address<input name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(user.email)}" required></label>
            <label class="profile-detail patient-profile-wide">Address<input name="address" autocomplete="street-address" maxlength="300" value="${escapeHtml(user.address || '')}" required></label>
            <label class="profile-detail">City<input name="city" autocomplete="address-level2" maxlength="100" value="${escapeHtml(user.city || '')}" required></label>
            <label class="profile-detail">State<input name="state" autocomplete="address-level1" maxlength="100" value="${escapeHtml(user.state || '')}" required></label>
          </div>
          <button class="button button-dark" type="submit">Save patient details <span aria-hidden="true">↗</span></button>
        </form>
        <div class="profile-details">
          <div class="profile-detail"><span>Account type</span><strong>Patient</strong></div>
          <div class="profile-detail"><span>Member since</span><strong>${escapeHtml(formatDate(user.createdAt, { month: 'long', day: 'numeric', year: 'numeric' }))}</strong></div>
          <div class="profile-detail"><span>Profile last updated</span><strong>${escapeHtml(formatDate(user.updatedAt, { month: 'long', day: 'numeric', year: 'numeric' }))}</strong></div>
          <div class="profile-detail"><span>Account ID</span><strong class="profile-id">${escapeHtml(user._id)}</strong></div>
        </div>` : `
        <div class="profile-details">
          <div class="profile-detail"><span>Full name</span><strong>${escapeHtml(user.name)}</strong></div>
          <div class="profile-detail"><span>Email address</span><strong>${escapeHtml(user.email)}</strong></div>
          <div class="profile-detail"><span>Account type</span><strong>${escapeHtml(user.role === 'admin' ? 'Administrator' : 'Doctor')}</strong></div>
          <div class="profile-detail"><span>Member since</span><strong>${escapeHtml(formatDate(user.createdAt, { month: 'long', day: 'numeric', year: 'numeric' }))}</strong></div>
          <div class="profile-detail"><span>Profile last updated</span><strong>${escapeHtml(formatDate(user.updatedAt, { month: 'long', day: 'numeric', year: 'numeric' }))}</strong></div>
          <div class="profile-detail"><span>Account ID</span><strong class="profile-id">${escapeHtml(user._id)}</strong></div>
        </div>`}
      <div class="profile-stats">
        <div><strong id="profile-appointments-value">—</strong><span>Confirmed appointments</span></div>
        <div><strong id="profile-cancelled-value">—</strong><span>Cancelled appointments</span></div>
      </div>
      `;
    const patientForm = document.querySelector('#patient-profile-form');
    if (patientForm) {
      patientForm.elements.dateOfBirth.max = localDateString();
      patientForm.elements.dateOfBirth.addEventListener('change', () => {
        patientForm.elements.age.value = calculateAge(patientForm.elements.dateOfBirth.value) ?? '';
      });
    }
    renderProfileAppointments(userBookings);
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      updateHeader();
      profileCard.innerHTML = '<div class="empty-state">Your session expired. Log in again to view your profile.</div>';
      return;
    }
    profileCard.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadDoctorDashboard() {
  if (getUser()?.role !== 'doctor') return;
  const form = document.querySelector('#doctor-profile-form');
  const appointmentList = document.querySelector('#doctor-appointment-list');
  try {
    const resource = await api('/api/resources/mine');
    for (const field of doctorProfileFields) {
      if (form.elements[field]) form.elements[field].value = Array.isArray(resource[field]) ? resource[field].join(', ') : resource[field] ?? '';
    }
    form.elements.specialty && (form.elements.specialty.value = resource.type || '');
    const bookings = await api('/api/bookings/doctor');
    userBookings = bookings;
    renderProfileAppointments(bookings);
    if (!bookings.length) {
      appointmentList.innerHTML = '<div class="empty-state">No patient appointments yet. New bookings will appear here.</div>';
      return;
    }
    appointmentList.innerHTML = bookings.map((booking) => {
      const linkedPatient = booking.user && typeof booking.user === 'object' ? booking.user : null;
      const patient = booking.patientDetails || linkedPatient;
      const patientAge = patient?.age ?? calculateAge(patient?.dateOfBirth);
      return `<article class="booking-card doctor-booking-card">
        <div><h3>${escapeHtml(patient?.name || 'Patient')}</h3><span class="booking-status">${escapeHtml(booking.status || 'confirmed')}</span><p>${escapeHtml(patient?.email || '')}</p></div>
        <p class="booking-time">${escapeHtml(formatDate(booking.startTime))} · ${escapeHtml(formatTime(booking.startTime))}–${escapeHtml(formatTime(booking.endTime))}</p>
        ${booking.status === 'confirmed' ? `<div class="booking-actions"><button class="button button-outline doctor-cancel-booking" type="button" data-booking-id="${escapeHtml(booking._id)}">Cancel visit</button></div>` : ''}
        ${patient ? `<details class="doctor-patient-details"><summary>Patient details</summary><div class="doctor-patient-details-grid">
          <span><strong>Date of birth</strong>${patient.dateOfBirth ? escapeHtml(formatDate(`${patient.dateOfBirth}T00:00:00`, { month: 'long', day: 'numeric', year: 'numeric' })) : 'Not provided'}</span>
          <span><strong>Age</strong>${patientAge ?? 'Not provided'}</span>
          <span><strong>Gender</strong>${escapeHtml(patient.gender || 'Not provided')}</span>
          <span><strong>Mobile</strong>${escapeHtml(patient.mobileNumber || 'Not provided')}</span>
          <span><strong>Address</strong>${escapeHtml([patient.address, patient.city, patient.state].filter(Boolean).join(', ') || 'Not provided')}</span>
          <span class="doctor-patient-health"><strong>Current health problem</strong>${escapeHtml(patient.currentHealthProblem || 'Not provided')}</span>
        </div></details>` : ''}
      </article>`;
    }).join('');
  } catch (error) {
    appointmentList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function openAuth() {
  authDialog.showModal();
  authForm.elements.email.focus();
}

function setAuthMode(registering) {
  isRegistering = registering;
  authError.textContent = '';
  authError.classList.add('hidden');
  authNameField.classList.toggle('hidden', !registering);
  authForm.elements.name.required = registering;
  accountTypeField.classList.toggle('hidden', !registering);
  doctorRegistrationFields.classList.toggle('hidden', !registering || authForm.elements.accountType.value !== 'doctor');
  patientRegistrationFields.classList.toggle('hidden', !registering || authForm.elements.accountType.value !== 'patient');
  authForm.elements.specialty.required = registering && authForm.elements.accountType.value === 'doctor';
  authForm.elements.slotDurationMinutes.required = registering && authForm.elements.accountType.value === 'doctor';
  for (const field of patientRegistrationFields.querySelectorAll('[name]')) {
    field.required = registering && authForm.elements.accountType.value === 'patient' && field.name !== 'currentHealthProblem';
  }
  authForm.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  authTitle.textContent = registering ? 'Let’s get started.' : 'Welcome back.';
  authDescription.textContent = registering ? 'Create an account to manage your appointments.' : 'Log in to manage your appointments.';
  authSubmit.innerHTML = registering ? 'Create account <span aria-hidden="true">↗</span>' : 'Log in <span aria-hidden="true">↗</span>';
  authSwitchPrompt.textContent = registering ? 'Already have an account?' : 'New to Carely?';
  authSwitch.textContent = registering ? 'Log in' : 'Create an account';
}

authForm.elements.accountType.forEach((option) => {
  option.addEventListener('change', () => {
    const doctorSelected = option.checked && option.value === 'doctor';
    const patientSelected = option.checked && option.value === 'patient';
    if (!doctorSelected && !patientSelected) return;
    doctorRegistrationFields.classList.toggle('hidden', !doctorSelected);
    patientRegistrationFields.classList.toggle('hidden', !patientSelected);
    authForm.elements.specialty.required = doctorSelected;
    authForm.elements.slotDurationMinutes.required = doctorSelected;
    for (const field of patientRegistrationFields.querySelectorAll('[name]')) {
      field.required = patientSelected && field.name !== 'currentHealthProblem';
    }
  });
});

async function openSlots(resource) {
  selectedResource = resource;
  selectedSlotId = '';
  bookingHealthProblem.value = '';
  document.querySelector('#slots-title').textContent = resource.name;
  document.querySelector('#slots-description').textContent = 'Pick a date to see available appointments.';
  slotDate.value = localDateString();
  slotDate.min = localDateString();
  slotList.innerHTML = '<div class="slot-empty">Checking appointment times…</div>';
  updateSlotSelection();
  slotsDialog.showModal();
  await Promise.all([loadSlots(), loadBookingPatientDetails()]);
}

async function loadSlots() {
  if (!selectedResource || !slotDate.value) return;
  slotList.innerHTML = '<div class="slot-empty">Checking appointment times…</div>';
  try {
    const slots = await api(`/api/resources/${encodeURIComponent(selectedResource._id)}/slots?date=${encodeURIComponent(slotDate.value)}`);
    if (!slots.length) {
      slotList.innerHTML = '<div class="slot-empty">This doctor has no appointment times set for this date.<br>Try another day or contact the clinic.</div>';
      selectedSlotId = '';
      updateSlotSelection();
      return;
    }
    if (!slots.some((slot) => slot._id === selectedSlotId)) selectedSlotId = '';
    slotList.innerHTML = slots.map((slot) => `<button class="slot-button${slot._id === selectedSlotId ? ' is-selected' : ''}" type="button" data-slot-id="${escapeHtml(slot._id)}" aria-pressed="${slot._id === selectedSlotId}">${escapeHtml(formatTime(slot.startTime))} – ${escapeHtml(formatTime(slot.endTime))}</button>`).join('');
    updateSlotSelection();
  } catch (error) {
    slotList.innerHTML = `<div class="slot-empty">${escapeHtml(error.message)}</div>`;
    selectedSlotId = '';
    updateSlotSelection();
  }
}

function updateSlotSelection() {
  const signedIn = Boolean(sessionStorage.getItem(TOKEN_KEY));
  const healthProblemProvided = bookingHealthProblem.value.trim().length > 0;
  bookAppointmentButton.disabled = !selectedSlotId ||
    (signedIn && !bookingPatientReady) ||
    !healthProblemProvided;
  if (!selectedSlotId) {
    slotSelectionMessage.textContent = 'Choose an available time to continue.';
  } else if (signedIn && !bookingPatientReady) {
    slotSelectionMessage.textContent = 'Complete your patient details before booking.';
  } else if (!healthProblemProvided) {
    slotSelectionMessage.textContent = 'Describe your health problem or write “No current health problem.”';
  } else {
    slotSelectionMessage.textContent = 'Your time and patient information are ready to share with this doctor.';
  }
}

async function loadBookingPatientDetails() {
  const hasSession = Boolean(sessionStorage.getItem(TOKEN_KEY));
  bookingPatientReady = false;
  bookingPatientSummary.classList.add('hidden');
  bookingCompleteProfile.classList.add('hidden');
  if (!hasSession) {
    bookingPatientStatus.textContent = 'Sign in or register with a complete patient profile. Your details will be shared only with the doctor for this appointment.';
    updateSlotSelection();
    return;
  }

  try {
    const patient = await api('/api/auth/me');
    if (!['patient', 'user'].includes(patient.role)) {
      bookingPatientStatus.textContent = 'Only patient accounts can book a visit. Sign in with a patient account to continue.';
      updateSlotSelection();
      return;
    }

    const requiredFields = ['name', 'dateOfBirth', 'gender', 'mobileNumber', 'email', 'address', 'city', 'state'];
    const missingFields = requiredFields.filter((field) => !String(patient[field] || '').trim());
    bookingPatientReady = missingFields.length === 0;
    bookingPatientStatus.textContent = bookingPatientReady
      ? 'These details will be attached to this appointment and shared with its doctor.'
      : `Complete your ${missingFields.join(', ')} in My profile before booking.`;
    bookingCompleteProfile.classList.toggle('hidden', bookingPatientReady);
    bookingPatientSummary.innerHTML = `
      <span><strong>Patient</strong>${escapeHtml(patient.name || 'Not provided')}</span>
      <span><strong>Date of birth / age</strong>${patient.dateOfBirth ? `${escapeHtml(patient.dateOfBirth)} · ${patient.age ?? 'Age unavailable'}` : 'Not provided'}</span>
      <span><strong>Gender</strong>${escapeHtml(patient.gender || 'Not provided')}</span>
      <span><strong>Mobile</strong>${escapeHtml(patient.mobileNumber || 'Not provided')}</span>
      <span><strong>Email</strong>${escapeHtml(patient.email || 'Not provided')}</span>
      <span class="booking-patient-address"><strong>Address</strong>${escapeHtml([patient.address, patient.city, patient.state].filter(Boolean).join(', ') || 'Not provided')}</span>`;
    bookingPatientSummary.classList.remove('hidden');
    if (!bookingHealthProblem.value.trim()) {
      bookingHealthProblem.value = patient.currentHealthProblem || '';
    }
    updateSlotSelection();
  } catch (error) {
    bookingPatientStatus.textContent = error.message;
    updateSlotSelection();
  }
}

async function bookAppointment() {
  if (!selectedSlotId || !selectedResource) return;
  if (!sessionStorage.getItem(TOKEN_KEY)) {
    reopenSlotsAfterAuth = true;
    slotsDialog.close();
    setAuthMode(false);
    openAuth();
    authError.textContent = 'Log in to confirm your appointment.';
    authError.classList.remove('hidden');
    return;
  }

  bookAppointmentButton.disabled = true;
  bookAppointmentButton.textContent = 'Confirming appointment…';
  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        slotId: selectedSlotId,
        currentHealthProblem: bookingHealthProblem.value.trim(),
      }),
    });
    slotsDialog.close();
    const user = getUser();
    if (result.confirmationEmailSent) {
      showConfirmationToast(
        'Appointment confirmed!',
        `Your confirmation email${user?.email ? ` was sent to ${user.email}` : ' has been sent to your registered email'}.`
      );
    } else {
      const emailMessage = result.confirmationEmailReason === 'not_configured'
        ? 'Email delivery is not configured yet.'
        : 'We could not send the confirmation email.';
      showConfirmationToast('Appointment confirmed!', `${emailMessage} Your appointment is saved in My appointments.`);
    }
    selectedSlotId = '';
    bookingHealthProblem.value = '';
    await loadBookingPatientDetails();
    await Promise.all([loadBookings(), loadSlots()]);
    document.querySelector('#my-bookings').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    document.querySelector('#slots-description').textContent = error.message;
    await loadSlots();
  } finally {
    bookAppointmentButton.innerHTML = 'Book appointment <span aria-hidden="true">↗</span>';
    updateSlotSelection();
  }
}

document.querySelector('#auth-button').addEventListener('click', () => {
  setAuthMode(false);
  openAuth();
});
document.querySelector('#close-auth').addEventListener('click', () => authDialog.close());
document.querySelector('#close-slots').addEventListener('click', () => slotsDialog.close());
bookingHealthProblem.addEventListener('input', updateSlotSelection);
bookingCompleteProfile.addEventListener('click', (event) => {
  event.preventDefault();
  slotsDialog.close();
  document.querySelector('#my-profile').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#close-confirmation-toast').addEventListener('click', () => {
  confirmationToast.classList.remove('visible');
  window.clearTimeout(confirmationToastTimeout);
});
authSwitch.addEventListener('click', () => setAuthMode(!isRegistering));
slotDate.addEventListener('change', () => {
  selectedSlotId = '';
  loadSlots();
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const body = { email: formData.get('email'), password: formData.get('password') };
  if (isRegistering) {
    body.name = formData.get('name');
    body.accountType = formData.get('accountType');
    if (body.accountType === 'doctor') {
      Object.assign(body, doctorProfilePayload(formData));
    } else if (body.accountType === 'patient') {
      for (const field of ['dateOfBirth', 'gender', 'mobileNumber', 'address', 'city', 'state', 'currentHealthProblem']) {
        body[field] = formData.get(field);
      }
    }
  }
  authSubmit.disabled = true;
  authError.textContent = '';
  authError.classList.add('hidden');
  try {
    const user = await api(`/api/auth/${isRegistering ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    sessionStorage.setItem(TOKEN_KEY, user.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify({ name: user.name, email: user.email, role: user.role }));
    let photoUploadError = '';
    if (isRegistering && user.role === 'doctor') {
      try {
        await uploadDoctorPhotos(formData, '/api/resources/mine/photos');
      } catch (error) {
        photoUploadError = error.message;
      }
    }
    authForm.reset();
    authDialog.close();
    updateHeader();
    clearNotice();
    showNotice(photoUploadError
      ? `Your account was created, but the photos could not be uploaded: ${photoUploadError}`
      : `You’re signed in. Your appointments are ready, ${user.name.split(' ')[0]}.`, Boolean(photoUploadError));
    if (user.role === 'doctor') {
      document.querySelector('#doctor-slots-form').elements.date.value = localDateString();
      document.querySelector('#doctor-slots-form').elements.date.min = localDateString();
      await Promise.all([loadResources(), loadProfile(), loadDoctorDashboard()]);
    } else if (user.role === 'admin') {
      await Promise.all([loadResources(), loadProfile(), loadAdminPortal()]);
    } else {
      await Promise.all([loadResources(), loadBookings(), loadProfile()]);
    }
    if (reopenSlotsAfterAuth && selectedResource) {
      reopenSlotsAfterAuth = false;
      slotsDialog.showModal();
      await Promise.all([loadSlots(), loadBookingPatientDetails()]);
    } else if (selectedResource && slotsDialog.open) {
      await loadSlots();
    }
  } catch (error) {
    authError.textContent = error.message;
    authError.classList.remove('hidden');
  } finally {
    authSubmit.disabled = false;
  }
});

profileCard.addEventListener('submit', async (event) => {
  const form = event.target.closest('#patient-profile-form');
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  delete body.age;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    showNotice('Your patient details have been saved.');
    await loadProfile();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#refresh-admin-data').addEventListener('click', loadAdminPortal);
document.querySelector('#admin-account-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-account-type]');
  if (!tab) return;
  activeAdminAccountType = tab.dataset.accountType;
  renderAdminAccounts();
});
document.querySelector('#admin-account-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  const status = button.dataset.accountAction;
  const action = status === 'active' ? 'activate/unblock' : status === 'blocked' ? 'block' : 'suspend';
  if (!window.confirm(`Are you sure you want to ${action} this account?`)) return;
  button.disabled = true;
  try {
    const result = await api(`/api/admin/users/${encodeURIComponent(button.dataset.userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus: status }),
    });
    showNotice(`${result.user.name}'s account is now ${status}.`);
    await loadAdminPortal();
  } catch (error) {
    showNotice(error.message, true);
    button.disabled = false;
  }
});

document.querySelector('#admin-booking-list').addEventListener('click', async (event) => {
  const button = event.target.closest('.admin-cancel-booking');
  if (!button) return;
  if (!window.confirm('Cancel this patient appointment?')) return;
  button.disabled = true;
  try {
    const result = await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.bookingId)}/cancel`, {
      method: 'PATCH',
    });
    showNotice(result.message);
    await loadAdminPortal();
  } catch (error) {
    showNotice(error.message, true);
    button.disabled = false;
  }
});

document.querySelector('#sign-out-button').addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  bookingList.innerHTML = '';
  document.querySelector('#doctor-appointment-list').innerHTML = '';
  userBookings = [];
  profileCard.innerHTML = '<div class="profile-loading">Log in to view your profile.</div>';
  updateHeader();
  showNotice('You’re logged out. Come back whenever you’re ready.');
});

resourceList.addEventListener('click', async (event) => {
  const profileButton = event.target.closest('[data-profile-id]');
  if (profileButton) {
    const resource = resources.find((item) => item._id === profileButton.dataset.profileId);
    if (resource) await openDoctorDetails(resource);
    return;
  }
  const button = event.target.closest('[data-resource-id]');
  const resource = button && resources.find((item) => item._id === button.dataset.resourceId);
  if (resource) await openSlots(resource);
});

doctorDetailsContent.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-detail-book]');
  if (!button) return;
  const resource = resources.find((item) => item._id === button.dataset.detailBook);
  doctorDetailsDialog.close();
  if (resource) await openSlots(resource);
});
document.querySelector('#close-doctor-details').addEventListener('click', () => doctorDetailsDialog.close());

slotList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-slot-id]');
  if (!button) return;
  selectedSlotId = button.dataset.slotId;
  slotList.querySelectorAll('[data-slot-id]').forEach((slotButton) => {
    const selected = slotButton.dataset.slotId === selectedSlotId;
    slotButton.classList.toggle('is-selected', selected);
    slotButton.setAttribute('aria-pressed', String(selected));
  });
  updateSlotSelection();
});
bookAppointmentButton.addEventListener('click', bookAppointment);

bookingList.addEventListener('click', async (event) => {
  const resendButton = event.target.closest('.resend-confirmation');
  if (resendButton) {
    resendButton.disabled = true;
    try {
      const result = await api(`/api/bookings/${encodeURIComponent(resendButton.dataset.bookingId)}/confirmation`, {
        method: 'POST',
      });
      showConfirmationToast('Confirmation email sent!', result.message);
      await loadBookings();
    } catch (error) {
      showNotice(error.message, true);
      resendButton.disabled = false;
    }
    return;
  }

  const button = event.target.closest('.cancel-booking');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/bookings/${encodeURIComponent(button.dataset.bookingId)}`, { method: 'DELETE' });
    showNotice('Your appointment has been cancelled.');
    await Promise.all([loadBookings(), loadResources()]);
  } catch (error) {
    showNotice(error.message, true);
    button.disabled = false;
  }
});

document.querySelector('#resource-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const body = doctorProfilePayload(formData);
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const resource = await api('/api/resources', { method: 'POST', body: JSON.stringify(body) });
    let photoUploadError = '';
    try {
      await uploadDoctorPhotos(formData, `/api/resources/${encodeURIComponent(resource._id)}/photos`);
    } catch (error) {
      photoUploadError = error.message;
    }
    form.reset();
    form.elements.slotDurationMinutes.value = 30;
    showNotice(photoUploadError
      ? `The doctor was added, but photos could not be uploaded: ${photoUploadError}`
      : 'The doctor has been added to your care team.', Boolean(photoUploadError));
    await loadResources();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

const slotsForm = document.querySelector('#slots-form');
slotsForm.elements.date.value = localDateString();
slotsForm.elements.date.min = localDateString();
slotsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(slotsForm);
  const resourceId = formData.get('resourceId');
  const body = {
    date: formData.get('date'),
    startHour: Number(formData.get('startHour')),
    endHour: Number(formData.get('endHour')),
  };
  const submit = slotsForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const endpoint = resourceId === 'all'
      ? '/api/resources/slots'
      : `/api/resources/${encodeURIComponent(resourceId)}/slots`;
    const result = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const message = result.alreadyScheduled
      ? `${result.message}. ${result.generated} new times added; existing times were kept.`
      : result.message || 'Appointment times are available.';
    showNotice(message);
    await loadResources();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

const doctorProfileForm = document.querySelector('#doctor-profile-form');
doctorProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(doctorProfileForm);
  const body = doctorProfilePayload(formData);
  const submit = doctorProfileForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/resources/mine', { method: 'PATCH', body: JSON.stringify(body) });
    await uploadDoctorPhotos(formData, '/api/resources/mine/photos');
    showNotice('Your doctor profile has been updated and is visible to patients.');
    await loadResources();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

const doctorSlotsForm = document.querySelector('#doctor-slots-form');
doctorSlotsForm.elements.date.value = localDateString();
doctorSlotsForm.elements.date.min = localDateString();
doctorSlotsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(doctorSlotsForm);
  const body = {
    date: formData.get('date'),
    startHour: Number(formData.get('startHour')),
    endHour: Number(formData.get('endHour')),
  };
  const submit = doctorSlotsForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const resource = await api('/api/resources/mine');
    const result = await api(`/api/resources/${encodeURIComponent(resource._id)}/slots`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    showNotice(`${result.message}. ${result.count} appointment times are available.`);
    await loadDoctorDashboard();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#doctor-appointment-list').addEventListener('click', async (event) => {
  const button = event.target.closest('.doctor-cancel-booking');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/bookings/${encodeURIComponent(button.dataset.bookingId)}`, { method: 'DELETE' });
    showNotice('The appointment has been cancelled.');
    await loadDoctorDashboard();
  } catch (error) {
    showNotice(error.message, true);
    button.disabled = false;
  }
});

document.querySelector('#doctor-search').addEventListener('submit', (event) => {
  event.preventDefault();
  filterDoctors();
  document.querySelector('#discover').scrollIntoView({ behavior: 'smooth' });
});
doctorQuery.addEventListener('input', filterDoctors);
specialtyFilter.addEventListener('change', () => {
  selectedSpecialty = specialtyFilter.value;
  renderResources();
});
specialtyChips.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-specialty]');
  if (!chip) return;
  selectedSpecialty = chip.dataset.specialty;
  renderResources();
});

updateHeader();
loadResources();
if (sessionStorage.getItem(TOKEN_KEY)) {
  if (getUser()?.role === 'doctor') {
    doctorSlotsForm.elements.date.value = localDateString();
    doctorSlotsForm.elements.date.min = localDateString();
    loadDoctorDashboard();
  } else if (getUser()?.role === 'admin') {
    loadAdminPortal();
  } else {
    loadBookings();
  }
  loadProfile();
}
