# Carely — Doctor Appointment Booking

Carely is a doctor appointment booking website and REST API. Patients can find doctors by specialty, select an available appointment, book and manage visits, and view their account profile. Doctors can register, publish and update their own profile, set availability, and manage appointments. Administrators can add doctors and manage appointment schedules.

## Features

### Patient website

- Browse doctors and filter by name, specialty, or description.
- Register with a full name, date of birth (age is calculated), gender, mobile number, email, address, city, state, and an optional current-health-problem description in Hindi or English.
- View and update name, date of birth, age, gender, mobile number, email, address, city, and state directly in the main **Your profile** panel. The current health problem is collected when booking, not in the patient profile, and is shared with the doctor for that appointment.
- Before confirming a booking, review the patient details being shared and enter the current health problem in Hindi or English (or state that there is no current problem).
- Choose an appointment date and an available time.
- Sign up or log in before confirming an appointment.
- See a confirmation popup and, when SMTP is configured, receive an email confirmation.
- View account details and appointment totals on **My profile**.
- Review appointments and cancel bookings.
- View detailed doctor profiles, including qualifications, registration details, languages, consultation fees, clinic information, and availability.
- Resend an appointment confirmation email from **My appointments** if it was not sent.
- Sign in separately in each browser tab; patient and doctor sessions stay independent across tabs.

### Doctor website

- Choose **Doctor** during registration and provide a public professional profile.
- A new doctor's public profile is created immediately; no administrator approval is required.
- Use the doctor dashboard to update profile details, upload a profile photo and clinic gallery, set available days and hours, and manage appointments.
- Profile details include qualification, experience, registration number, gender, languages, biography, fee, consultation types, clinic/hospital name and address, estimated patients treated, and awards.
- Availability is limited to 9 AM–8 PM in the configured timezone; appointments are generated only on selected available days and within the doctor's configured hours.
- View and cancel appointments booked with your own doctor profile. A doctor cannot edit another doctor's profile or schedule.
- Each appointment includes a snapshot of the patient's required contact/demographic details and the health problem entered for that booking. Only the doctor who owns the booked resource sees that snapshot in their dashboard; later profile edits do not change existing appointment details.

### Admin website

- Add complete doctor profiles and upload profile/clinic photos.
- Generate appointment times for one doctor or all doctors.
- View patient and doctor details in separate **Patients** and **Doctors** selections. The Doctors list includes self-registered doctor accounts and doctors added by an administrator; administrator-created listings without a doctor login are labelled accordingly.
- Cancel any confirmed booking from **All bookings**.
- Suspend or block patient/doctor accounts to prevent login and appointment booking; activate/unblock accounts later without deleting their data.

## Requirements

- Node.js 18 or newer
- MongoDB running locally or a MongoDB Atlas connection string
- SMTP credentials (optional; required only to send appointment confirmation emails)

## Install

From the project directory:

```powershell
npm install
```

Dependencies are defined in `package.json`: Express, Mongoose, JWT, bcrypt, dotenv, Multer for image uploads, Nodemailer, and nodemon for development.

## Configure environment

Create a local `.env` file from the example:

```powershell
Copy-Item .env.example .env
```

Configure `.env`:

```dotenv
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/booking_system
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

APPOINTMENT_TIME_ZONE=Asia/Kolkata
```

`PORT`, `MONGO_URI`, and `JWT_SECRET` are needed to run the application. The local project `.gitignore` excludes `.env` and `node_modules/`; do not commit credentials.

### Gmail confirmation email setup

To send appointment confirmations from Gmail:

1. Enable 2-Step Verification on the sender's Google account.
2. Create an App Password in Google Account → Security → App passwords.
3. Set the SMTP values in `.env`, using the App Password—not the regular Gmail password:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=Carely <your-address@gmail.com>
```

Use the sender's actual Gmail address in both `SMTP_USER` and `SMTP_FROM`. The recipient is the email address saved on the patient's Carely account. `APPOINTMENT_TIME_ZONE` sets the timezone used in confirmation emails. Restart the server after changing `.env`.

If SMTP settings are empty, appointments can still be booked and the website indicates that the confirmation email was not sent. After configuring SMTP, patients can use **Send confirmation email** from **My appointments** to retry.

## Run

```powershell
npm run dev
```

Or start without the development file watcher:

```powershell
npm start
```

By default, the website and API use [http://localhost:5001](http://localhost:5001). If that port is in use, set `PORT` in `.env` to another available port.

## Use the website

### Patient

1. Choose **Patient** at registration and enter your personal/contact details. Describe your current health problem in Hindi or English if you wish.
2. Select **Book a visit**, choose a date, and select an available time.
3. Log in or create an account if prompted.
4. Select **Book appointment**. A confirmation popup appears. An email is sent when SMTP is configured.
5. Use **My appointments** to review bookings, resend an unsent confirmation, or cancel an appointment.
6. Select **My profile** to view and update your full name, date of birth, calculated age, gender, mobile, email, address, city, state, and current health problem, along with your account ID, member-since date, and appointment totals. Passwords are never returned by the profile API.

### Doctor

1. Choose **Doctor** at registration and enter your name, email, password, specialty, and profile information.
2. Your doctor listing is published immediately.
3. Use **Doctor dashboard** to edit your listing, upload profile and clinic photos, set working days/hours, add appointment times, and view or cancel patient bookings for your profile.
4. Open Carely in a separate tab and sign in there to use a patient account at the same time; each tab has its own session.

### Administrator

1. Log in using an account whose MongoDB `role` is `admin`.
2. In **Care Team Settings**, add doctors with their profile details and photos.
3. Select a doctor or **All doctors**, choose a date, and generate appointment times.
4. Choose **Patients** or **Doctors** under **Manage accounts** to see only that account type. Suspend, block, or reactivate the selected account as needed.
5. Review **All bookings** and cancel any confirmed patient appointment.

Suspending or blocking is reversible and does not delete the account or its booking history. Suspended/blocked accounts cannot log in or make bookings; suspended/blocked doctor profiles are removed from public doctor listings until reactivated.

Schedules use **9:00 AM–8:00 PM** in `APPOINTMENT_TIME_ZONE`, constrained by each doctor's selected days and availability hours. When a patient opens a doctor for an available date with no schedule, slots are generated automatically using that doctor's configured appointment duration. Past times, booked times, and slots outside configured availability are excluded.

### Doctor photos

Doctor and clinic images are uploaded as JPEG, PNG, GIF, or WebP files (up to 5 MB each). Clinic galleries accept up to 12 images per doctor. Files are stored locally under `public/uploads`; for production deployments on ephemeral or multi-instance hosts, configure persistent shared storage before relying on uploaded images.

At booking time, Carely records a snapshot of the patient's name, date of birth and age, gender, mobile number, email, address, city, state, and the health problem entered for that appointment. Doctors can access only appointments for their own doctor profile; the snapshot is not added to public doctor or administrator listings. Patients must complete required profile/contact details before booking.

Review and rating controls are currently hidden in the website. Existing review records and API endpoints are retained, so hiding the controls does not delete saved reviews.

### Create an administrator

Register an account through the website or `POST /api/auth/register`, then change its role directly in MongoDB:

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

Log out and log back in after changing the role so the website receives an updated token.

## API reference

Protected endpoints require this HTTP header:

```text
Authorization: Bearer <JWT_TOKEN>
```

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| `GET` | `/api` | Check that the API is running | Public |
| `POST` | `/api/auth/register` | Register a patient or doctor. Patient registration accepts `dateOfBirth`, `gender`, `mobileNumber`, `address`, `city`, `state`, and optional `currentHealthProblem`. Doctor registrations accept profile fields including `specialty`, `qualification`, `experienceYears`, `registrationNumber`, `languages`, `consultationFee`, `availableDays`, `availableStartTime`, `availableEndTime`, `consultationTypes`, `clinicName`, `clinicAddress`, `totalPatientsTreatedEstimate`, `awardsAndAchievements`, `description`, and `slotDurationMinutes`. | Public |
| `POST` | `/api/auth/login` | Sign in with `{ "email", "password" }` and receive a JWT | Public |
| `GET` | `/api/auth/me` | Get the signed-in user's name, email, role, and account timestamps | User |
| `PATCH` | `/api/auth/me` | Update the signed-in patient's name, email, date of birth, gender, mobile, address, city, state, and current health problem | Patient |
| `GET` | `/api/admin/users` | List patient/doctor details, account status, doctor profile, and booking counts | Admin |
| `PATCH` | `/api/admin/users/:id/status` | Set `{ "accountStatus": "active" }`, `"suspended"`, or `"blocked"` for a patient or doctor | Admin |
| `GET` | `/api/admin/bookings` | List bookings with patient and doctor details | Admin |
| `PATCH` | `/api/admin/bookings/:id/cancel` | Cancel any confirmed booking | Admin |
| `GET` | `/api/resources` | List doctors | Public |
| `GET` | `/api/resources/mine` | Get the signed-in doctor's own profile | Doctor |
| `PATCH` | `/api/resources/mine` | Update the signed-in doctor's full public profile | Doctor |
| `POST` | `/api/resources/mine/photos` | Upload `profilePhoto` and/or multiple `clinicPhotos` as multipart form-data | Doctor |
| `POST` | `/api/resources` | Add a doctor with full profile fields | Admin |
| `POST` | `/api/resources/:id/photos` | Upload profile/clinic photos for a doctor listing | Admin |
| `GET` | `/api/resources/:id/reviews` | List public reviews for a doctor | Public |
| `GET` | `/api/resources/:id/next-slot` | Find the next available appointment time | Public |
| `POST` | `/api/admin/resources/:id/reviews` | Add a historical review with `reviewerName`, `rating`, and `comment` | Admin |
| `DELETE` | `/api/admin/reviews/:id` | Remove an administrator-entered historical review | Admin |
| `POST` | `/api/resources/slots` | Generate slots for all doctors; body `{ "date", "startHour": 9, "endHour": 20 }` | Admin |
| `POST` | `/api/resources/:id/slots` | Generate slots for one doctor with the same body format | Admin or owning doctor |
| `GET` | `/api/resources/:id/slots?date=YYYY-MM-DD` | Get available slots; creates the default schedule if none exists | Public |
| `POST` | `/api/bookings` | Book with `{ "slotId": "<SLOT_ID>", "currentHealthProblem": "..." }`. Patient contact details must be complete; the API snapshots the details on this appointment. | Patient |
| `GET` | `/api/bookings/me` | List the signed-in user's bookings | User |
| `POST` | `/api/bookings/:id/review` | Submit a verified review for an ended appointment with `{ "rating", "comment" }` | Appointment owner |
| `GET` | `/api/bookings/doctor` | List appointments and their patient-detail snapshots for the signed-in doctor's own profile | Doctor |
| `POST` | `/api/bookings/:id/confirmation` | Resend an appointment confirmation email | Booking owner |
| `DELETE` | `/api/bookings/:id` | Cancel the signed-in user's booking or a booking for the doctor's own profile | Booking owner or owning doctor |

Slot-generation dates use `YYYY-MM-DD`; hours use 24-hour time in the configured appointment timezone. If two users try to book the same appointment simultaneously, a MongoDB unique partial index permits only one confirmed booking. The other request receives `409 Conflict`.

## Project layout

```text
config/db.js             MongoDB connection
middleware/auth.js       JWT authentication
middleware/admin.js      Admin authorization
models/                  User, doctor/resource, slot, and booking schemas
public/index.html        Carely website
public/styles.css        Responsive website styles
public/app.js            Search, profile, auth, scheduling, and booking UI
routes/auth.js           Registration, login, and profile API
routes/resources.js      Doctor profiles, photo uploads, reviews, and availability API
routes/bookings.js       Booking, cancellation, reviews, and email retry API
routes/admin.js          Admin account, booking, and historical-review API
models/Review.js         Verified and administrator-entered doctor reviews
utils/doctor-profile.js  Doctor profile validation and normalization
utils/slots.js           Timezone-aware appointment slot generation and filtering
utils/booking-email.js   SMTP confirmation emails
server.js                Express entry point and static website server
```
