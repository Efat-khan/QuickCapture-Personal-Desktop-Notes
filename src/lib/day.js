// Days are stored as local calendar dates in 'YYYY-MM-DD' form, so "today" follows the user's timezone.

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export function toDayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDayKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDayKey(key, deltaDays) {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + deltaDays);
  return toDayKey(date);
}

/** { label: 'Today' | 'Yesterday' | 'Tomorrow' | 'Monday', date: 'November 15, 2026' } */
export function describeDay(key, todayKey) {
  const date = fromDayKey(key);
  let label = weekdayFormatter.format(date);
  if (key === todayKey) label = 'Today';
  else if (key === shiftDayKey(todayKey, -1)) label = 'Yesterday';
  else if (key === shiftDayKey(todayKey, 1)) label = 'Tomorrow';
  return { label, date: fullDateFormatter.format(date) };
}
