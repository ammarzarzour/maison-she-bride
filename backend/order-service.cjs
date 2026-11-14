'use strict';
const { createHash } = require('node:crypto');
const { prepareOrder } = require('./order-preparation.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('INVALID_ID');
  return value.toLowerCase();
}
function canonicalItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('INVALID_ITEMS');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).length !== 2 || !Object.hasOwn(item,'product_id') ||
        !Object.hasOwn(item,'quantity')) throw new Error('INVALID_ITEM_FIELDS');
    const product_id = id(item.product_id);
    if (seen.has(product_id)) throw new Error('DUPLICATE_PRODUCT');
    seen.add(product_id);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647) throw new Error('INVALID_QUANTITY');
    return {product_id,quantity:item.quantity};
  }).sort((a,b) => a.product_id.localeCompare(b.product_id));
}
// Server orchestration only. NOT a database adapter or a deployed endpoint.
// transaction MUST resolve only after commit and roll back ALL writes on error.
// lockRequest must serialize the buyer/key pair even when no record exists yet.
// lockProducts must lock inventory AND relevant store state in deterministic order.
// Every tx operation below MUST use that same database transaction/connection.
async function submitOrder(store, authenticatedBuyerId, requestKey, requestedItems) {
  const buyer = id(authenticatedBuyerId);
  const key = id(requestKey);
  const items = canonicalItems(requestedItems);
  const fingerprint = createHash('sha256').update(JSON.stringify({version:1,currency:'USD',items})).digest('hex');
  if (!store || typeof store.transaction !== 'function') throw new Error('TRANSACTION_ADAPTER_REQUIRED');
  return store.transaction(async tx => {
    await tx.lockRequest(buyer,key);
    const prior = await tx.findRequest(buyer,key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
      return {order_id:id(prior.order_id),replayed:true};
    }
    const products = await tx.lockProducts(items.map(item=>item.product_id));
    const prepared = prepareOrder(buyer,items,products);
    await tx.reserveInventory(prepared.items);
    const orderId = id(await tx.insertOrder(prepared));
    await tx.rememberRequest({buyer_id:buyer,key,fingerprint,order_id:orderId});
    return {order_id:orderId,replayed:false};
  });
}
module.exports = {submitOrder};
