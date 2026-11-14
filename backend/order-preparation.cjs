'use strict';
// Pure server-side order preparation. No persistence, stock reservation or payment.
// trustedProducts MUST be loaded by the server, never copied from request JSON.
// The eventual writer must revalidate under row locks in the SAME transaction.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code) { throw new Error(code); }
function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_ID');
  return value.toLowerCase();
}
function cents(value) {
  // Postgres NUMERIC should be fetched as text to preserve exact decimal prices.
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(value)) fail('INVALID_PRICE');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function money(value) {
  return (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0');
}
function prepareOrder(authenticatedBuyerId, requestedItems, trustedProducts) {
  const buyerId = uuid(authenticatedBuyerId);
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 100) fail('INVALID_ITEMS');
  if (!Array.isArray(trustedProducts) || trustedProducts.length > 100) fail('INVALID_CATALOG');
  const products = new Map();
  for (const product of trustedProducts) {
    if (!product || typeof product !== 'object') fail('INVALID_CATALOG');
    const id = uuid(product.id);
    if (products.has(id)) fail('DUPLICATE_CATALOG_ID');
    products.set(id, product);
  }
  const seen = new Set();
  let total = 0n;
  const items = requestedItems.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).length !== 2 || !Object.hasOwn(item, 'product_id') ||
        !Object.hasOwn(item, 'quantity')) fail('INVALID_ITEM_FIELDS');
    const id = uuid(item.product_id);
    if (seen.has(id)) fail('DUPLICATE_PRODUCT');
    seen.add(id);
    const quantity = item.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) fail('INVALID_QUANTITY');
    const product = products.get(id);
    if (!product || product.status !== 'published' || product.store_status !== 'approved') fail('PRODUCT_UNAVAILABLE');
    if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > 2147483647) fail('INVALID_STOCK');
    if (quantity > product.stock) fail('INSUFFICIENT_STOCK');
    const price = cents(product.price_usd);
    total += price * BigInt(quantity);
    // orders.total_amount NUMERIC(16,2), serialized as exact decimal text.
    if (total > 9999999999999999n) fail('TOTAL_OVERFLOW');
    return { product_id:id, quantity, unit_price_usd:money(price) };
  });
  // USD base quote only. Other display currencies await the separate FX adapter.
  return {order:{buyer_id:buyerId,status:'pending',currency:'USD',fx_per_usd:'1.000000',
    total_amount:money(total)},items};
}
module.exports = { prepareOrder };
