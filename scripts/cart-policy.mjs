import { checkStock } from './inventory-policy.mjs';

/** Offline cart preflight. SKU is a catalog key, never a customer identifier. */
export function checkCartAvailability({ lines, catalog } = {}) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 1000 || !Array.isArray(catalog) || catalog.length > 10000) {
    throw new RangeError('Invalid cart or catalog');
  }
  const stock = new Map();
  for (const item of catalog) {
    if (!item || typeof item.sku !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.sku) || stock.has(item.sku) || !Number.isSafeInteger(item.available) || item.available < 0) {
      throw new RangeError('Invalid or duplicate catalog SKU');
    }
    stock.set(item.sku, item.available);
  }
  const requested = new Map();
  for (const line of lines) {
    if (!line || typeof line.sku !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(line.sku) || !stock.has(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError('Invalid cart line');
    }
    const total = (requested.get(line.sku) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new RangeError('Cart quantity overflow');
    requested.set(line.sku, total);
  }
  const items = [...requested].map(([sku, quantity]) => Object.freeze({ sku, quantity, ...checkStock({ available: stock.get(sku), requested: quantity }) }));
  return Object.freeze({ eligible: items.every(item => item.eligible), items: Object.freeze(items), authorized: false, persisted: false });
}
