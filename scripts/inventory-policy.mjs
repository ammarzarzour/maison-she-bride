/** Offline inventory preflight for Maison She Bride. No reservations, payments, or writes. */
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const dateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
export function checkStock({ available, requested } = {}) {
  if (!integer(available) || !Number.isSafeInteger(requested) || requested <= 0) throw new RangeError('Stock and requested quantity must be safe nonnegative/positive integers');
  return Object.freeze({ eligible: requested <= available, remaining: Math.max(0, available - requested), authorized: false, persisted: false });
}
/** Rental dates are [start, end) in UTC calendar days; no customer data accepted. */
export function checkRentalAvailability({ units, requested = 1, start, end, holds = [] } = {}) {
  if (!integer(units) || !Number.isSafeInteger(requested) || requested <= 0) throw new RangeError('Invalid rental unit count');
  if (!dateOnly(start) || !dateOnly(end) || start >= end) throw new RangeError('Invalid rental interval');
  if (!Array.isArray(holds) || holds.length > 10000) throw new RangeError('Invalid holds list');
  const events = [];
  for (const hold of holds) {
    if (!hold || !dateOnly(hold.start) || !dateOnly(hold.end) || hold.start >= hold.end || !Number.isSafeInteger(hold.quantity) || hold.quantity <= 0) throw new RangeError('Invalid hold');
    if (hold.end <= start || hold.start >= end) continue;
    events.push([hold.start < start ? start : hold.start, hold.quantity]);
    events.push([hold.end > end ? end : hold.end, -hold.quantity]);
  }
  events.sort((a,b) => a[0].localeCompare(b[0]) || a[1]-b[1]);
  let occupied = 0, peak = 0;
  for (const [,delta] of events) {
    occupied += delta;
    if (!Number.isSafeInteger(occupied) || occupied < 0 || occupied > units) {
      throw new RangeError('Existing rental holds exceed available units');
    }
    peak = Math.max(peak, occupied);
  }
  return Object.freeze({ eligible: peak + requested <= units, peakReserved: peak, availableAtPeak: Math.max(0, units - peak), authorized: false, persisted: false });
}
