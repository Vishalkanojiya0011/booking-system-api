const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

const formatAppointmentDate = (value) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata',
  }).format(value);

const sendBookingConfirmation = async ({ email, patientName, doctorName, startTime, endTime }) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return { sent: false, reason: 'not_configured' };
  }

  let transport;
  try {
    const appointmentDate = formatAppointmentDate(startTime);
    const appointmentEnd = new Intl.DateTimeFormat('en', {
      timeStyle: 'short',
      timeZone: process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata',
    }).format(endTime);
    const safePatientName = escapeHtml(patientName);
    const safeDoctorName = escapeHtml(doctorName);
    const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata';
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: `Appointment confirmed with ${doctorName}`,
      text: `Hello ${patientName}, your appointment with ${doctorName} is confirmed for ${appointmentDate}–${appointmentEnd} (${timeZone}).`,
      html: `<p>Hello ${safePatientName},</p><p>Your appointment with <strong>${safeDoctorName}</strong> is confirmed.</p><p><strong>Date and time:</strong> ${escapeHtml(appointmentDate)}–${escapeHtml(appointmentEnd)} (${escapeHtml(timeZone)})</p><p>Thank you for choosing Carely.</p>`,
    });
    return { sent: true };
  } catch (error) {
    console.error(`Appointment confirmation email failed for ${email}: ${error.message}`);
    return { sent: false, reason: 'delivery_failed' };
  } finally {
    if (transport) transport.close();
  }
};

module.exports = { sendBookingConfirmation };
