/** Asia/Karachi helpers — PKT is UTC+5 year-round (no DST). */

export const TZ = 'Asia/Karachi';
export const PKT_OFFSET_HOURS = 5;
export const DEFAULT_CHECKOUT_HOUR = 18;
export const DEFAULT_CHECKOUT_MINUTE = 0;

function getParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

/** Karachi calendar date as YYYY-MM-DD */
export function karachiWorkDate(date = new Date()) {
  const p = getParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function karachiClockParts(date = new Date()) {
  return getParts(date);
}

/** UTC MySQL DATETIME string */
export function toMysqlUtc(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Karachi wall-clock on work_date → UTC Date (PKT = UTC+5). */
export function karachiWallToUtcDate(workDate, hour, minute = 0, second = 0) {
  const [y, m, d] = workDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - PKT_OFFSET_HOURS, minute, second));
}

export function parseMysqlUtc(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  if (s.includes('T')) return new Date(s.endsWith('Z') ? s : `${s}Z`);
  return new Date(`${s.replace(' ', 'T')}Z`);
}

export function formatKarachiTime(value) {
  const d = parseMysqlUtc(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/** Minutes since midnight in Asia/Karachi for a UTC datetime. */
export function karachiMinutesSinceMidnight(value) {
  const d = parseMysqlUtc(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  const p = getParts(d);
  return p.hour * 60 + p.minute;
}

/** Average clock time from a list of UTC datetimes → display string or null. */
export function averageKarachiClock(values) {
  const mins = values
    .map(karachiMinutesSinceMidnight)
    .filter((m) => m != null && Number.isFinite(m));
  if (!mins.length) return null;
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  const hour24 = Math.floor(avg / 60) % 24;
  const minute = avg % 60;
  const probe = karachiWallToUtcDate('2000-01-01', hour24, minute);
  return formatKarachiTime(probe);
}

export function workedMinutesBetween(checkInUtc, checkOutUtc) {
  const a = parseMysqlUtc(checkInUtc);
  const b = parseMysqlUtc(checkOutUtc);
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function monthBounds(monthStr) {
  // monthStr: YYYY-MM
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, year: y, month: m, lastDay };
}
