'use strict';
// Pure conversion boundary, not an SP Today response parser or live API client.
// A trusted server adapter must produce this snapshot; never trust client rates.
const CURRENCIES = new Set(['USD', 'SAR', 'AED']);
function convertToNewSyp(amount, currency, snapshot, nowMs = Date.now(), maxAgeMs = 900000) {
  if (!CURRENCIES.has(currency)) throw new Error('UNSUPPORTED_CURRENCY');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('INVALID_AMOUNT');
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) throw new Error('INVALID_CLOCK');
  if (!snapshot || snapshot.source !== 'https://www.sp-today.com/' ||
      snapshot.side !== 'sell' || snapshot.denomination !== 'new' || snapshot.quote !== 'SYP') throw new Error('INVALID_RATE_SOURCE');
  // Adapter supplies the provider's actual observation time, never fetch time.
  if (!Number.isSafeInteger(snapshot.observedAtMs) || snapshot.observedAtMs > nowMs ||
      nowMs - snapshot.observedAtMs > maxAgeMs) throw new Error('STALE_OR_INVALID_RATE_TIME');
  if (!snapshot.rates || !Object.hasOwn(snapshot.rates, currency)) throw new Error('MISSING_RATE');
  const rate = snapshot.rates[currency];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error('INVALID_RATE');
  const value = amount * rate;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER / 100) throw new Error('AMOUNT_OVERFLOW');
  return { amount: value, currency: 'SYP', denomination: 'new', rate,
    source: snapshot.source, observedAtMs: snapshot.observedAtMs };
}
module.exports = { convertToNewSyp };
