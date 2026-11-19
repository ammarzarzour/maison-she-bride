import { checkRentalAvailability } from './inventory-policy.mjs';

const skuPattern = /^[A-Za-z0-9_-]{1,64}$/;
/** Read-only preflight for a multi-product rental cart. Dates are UTC [start,end). */
export function checkRentalCartAvailability({ lines, catalog, holds = [], start, end } = {}) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 1000 ||
      !Array.isArray(catalog) || catalog.length > 10000 ||
      !Array.isArray(holds) || holds.length > 10000) {
    throw new RangeError('Invalid rental cart input');
  }
  const stock = new Map();
  for (const item of catalog) {
    if (!item || typeof item.sku !== 'string' || !skuPattern.test(item.sku) ||
        stock.has(item.sku) || !Number.isSafeInteger(item.units) || item.units < 0) {
      throw new RangeError('Invalid or duplicate rental SKU');
    }
    stock.set(item.sku, item.units);
  }
  const requested = new Map();
  for (const line of lines) {
    if (!line || typeof line.sku !== 'string' || !skuPattern.test(line.sku) ||
        !stock.has(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError('Invalid rental cart line');
    }
    const total = (requested.get(line.sku) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new RangeError('Rental cart quantity overflow');
    requested.set(line.sku, total);
  }
  const bySku = new Map();
  for (const hold of holds) {
    if (!hold || typeof hold.sku !== 'string' || !skuPattern.test(hold.sku) ||
        !stock.has(hold.sku)) throw new RangeError('Invalid rental hold SKU');
    if (!bySku.has(hold.sku)) bySku.set(hold.sku, []);
    bySku.get(hold.sku).push({ start: hold.start, end: hold.end, quantity: hold.quantity });
  }
  // Validate every hold, including holds for products not in this cart.
  for (const [sku, entries] of bySku) {
    checkRentalAvailability({ units: stock.get(sku), requested: 1, start, end, holds: entries });
  }
  const items = [...requested].map(([sku, quantity]) => Object.freeze({
    sku, quantity,
    ...checkRentalAvailability({ units: stock.get(sku), requested: quantity, start, end, holds: bySku.get(sku) ?? [] })
  }));
  return Object.freeze({ eligible: items.every(item => item.eligible), items: Object.freeze(items), authorized: false, persisted: false });
}
