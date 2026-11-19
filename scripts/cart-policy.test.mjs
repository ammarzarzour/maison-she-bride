import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCartAvailability } from './cart-policy.mjs';

const catalog = [{sku:'dress_1',available:3},{sku:'veil-2',available:2}];
test('aggregates repeated SKU before stock check', () => {
  const result = checkCartAvailability({catalog,lines:[{sku:'dress_1',quantity:2},{sku:'dress_1',quantity:2},{sku:'veil-2',quantity:1}]});
  assert.equal(result.eligible,false);
  assert.deepEqual(result.items.map(x=>[x.sku,x.quantity,x.eligible]),[['dress_1',4,false],['veil-2',1,true]]);
  assert.equal(result.authorized,false); assert.equal(result.persisted,false);
});
test('valid cart remains read-only and does not mutate inputs', () => {
  const lines=[{sku:'dress_1',quantity:1},{sku:'dress_1',quantity:2}];
  const result=checkCartAvailability({catalog,lines});
  assert.equal(result.eligible,true); assert.equal(result.items[0].remaining,0);
  assert.deepEqual(lines,[{sku:'dress_1',quantity:1},{sku:'dress_1',quantity:2}]);
  assert.equal(Object.isFrozen(result.items),true);
});
test('rejects unknown and duplicate SKUs and unsafe quantities', () => {
  const base={catalog,lines:[{sku:'dress_1',quantity:1}]};
  assert.throws(()=>checkCartAvailability({...base,lines:[{sku:'unknown',quantity:1}]}),RangeError);
  assert.throws(()=>checkCartAvailability({...base,catalog:[...catalog,catalog[0]]}),RangeError);
  assert.throws(()=>checkCartAvailability({...base,lines:[{sku:'dress_1',quantity:0}]}),RangeError);
  assert.throws(()=>checkCartAvailability({...base,lines:[{sku:'dress_1',quantity:Number.MAX_SAFE_INTEGER},{sku:'dress_1',quantity:1}]}),RangeError);
  assert.throws(()=>checkCartAvailability({...base,lines:[]}),RangeError);
});
