const isValidDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
};

const toMinutes = (time) => {
  if (typeof time === 'number') return time * 60;
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const dateInTimeZone = (date, minutes, timeZone) => {
  const [year, month, day] = date.split('-').map(Number);
  const targetTime = Date.UTC(year, month - 1, day, 0, minutes);
  const zonedParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(targetTime));
  const part = (type) => Number(zonedParts.find((item) => item.type === type).value);
  const representedTime = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return new Date(targetTime - (representedTime - targetTime));
};

const generateSlots = (resource, date, startTime = resource.availableStartTime || 9, endTime = resource.availableEndTime || 20) => {
  const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata';
  const duration = resource.slotDurationMinutes || 30;
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes >= endMinutes) return [];
  const slots = [];
  let cursor = dateInTimeZone(date, startMinutes, timeZone);
  const end = dateInTimeZone(date, endMinutes, timeZone);

  while (cursor.getTime() + duration * 60000 <= end.getTime()) {
    const slotEnd = new Date(cursor.getTime() + duration * 60000);
    slots.push({
      resource: resource._id,
      date,
      startTime: new Date(cursor),
      endTime: slotEnd,
    });
    cursor = slotEnd;
  }
  return slots;
};

const isWithinClinicHours = (slot, startTime = 9, endTime = 20) => {
  const timeZone = process.env.APPOINTMENT_TIME_ZONE || 'Asia/Kolkata';
  const localTime = (date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type) => Number(parts.find((item) => item.type === type).value);
    return {
      date: `${part('year')}-${String(part('month')).padStart(2, '0')}-${String(part('day')).padStart(2, '0')}`,
      minutes: part('hour') * 60 + part('minute'),
    };
  };
  const start = localTime(slot.startTime);
  const end = localTime(slot.endTime);
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  return start.date === end.date &&
    start.minutes >= startMinutes &&
    end.minutes <= endMinutes;
};

module.exports = { generateSlots, isValidDate, isWithinClinicHours };
