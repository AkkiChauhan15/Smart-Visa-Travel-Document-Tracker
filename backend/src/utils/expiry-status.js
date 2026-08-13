const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function dateOnlyToUtc(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new TypeError('Expiry date must use YYYY-MM-DD format');
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcToday(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function daysUntilExpiry(expiryDate, now = new Date()) {
  const expiry = dateOnlyToUtc(expiryDate);
  if (expiry === null) return null;
  return Math.round((expiry - utcToday(now)) / MILLISECONDS_PER_DAY);
}

export function calculateExpiryStatus(expiryDate, reminderDays = [], now = new Date()) {
  const remaining = daysUntilExpiry(expiryDate, now);
  if (remaining === null) {
    return { status: 'no-expiry', daysUntilExpiry: null, reminderWindowDays: null };
  }

  const enabledThresholds = reminderDays.filter(Number.isInteger).filter((days) => days >= 0);
  const reminderWindowDays = enabledThresholds.length ? Math.max(...enabledThresholds) : null;

  if (remaining < 0) {
    return { status: 'expired', daysUntilExpiry: remaining, reminderWindowDays };
  }
  if (reminderWindowDays !== null && remaining <= reminderWindowDays) {
    return { status: 'expiring-soon', daysUntilExpiry: remaining, reminderWindowDays };
  }
  return { status: 'valid', daysUntilExpiry: remaining, reminderWindowDays };
}

