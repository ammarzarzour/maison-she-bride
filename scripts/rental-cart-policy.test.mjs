import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRentalCartAvailability } from './rental-cart-policy.mjs';
const catalog = [{sku:'dress_1',units:3},{sku:'veil-2',units:2}];
const start='2026-12-10', end='2026-12-12';
const base={catalog,start,end};
test('aggregates repeated SKU and isolates availability by product',()=>{
  const result=checkRentalCartAvailability({...base,lines:[{sku:'dress_1',quantity:1},{sku:'dress_1',quantity:1},{sku:'veil-2',quantity:1}],holds:[{sku:'dress_1',quantity:2,start:'2026-12-11',end:'2026-12-13'}]});
  assert.equal(result.eligible,false);
  assert.deepEqual(result.items.map(x=>[x.sku,x.quantity,x.eligible]),[['dress_1',2,false],['veil-2',1,true]]);
  assert.equal(result.authorized,false); assert.equal(result.persisted,false);
});
test('back-to-back rental does not overlap and inputs are unchanged',()=>{
  const holds=[{sku:'dress_1',quantity:3,start:'2026-12-08',end:start}];
  const result=checkRentalCartAvailability({...base,lines:[{sku:'dress_1',quantity:3}],holds});
  assert.equal(result.eligible,true);assert.equal(result.items[0].availableAtPeak,3);
  assert.deepEqual(holds,[{sku:'dress_1',quantity:3,start:'2026-12-08',end:start}]);
  assert.equal(Object.isFrozen(result.items),true);
});
test('rejects malformed catalog, unknown holds, and unsafe cart totals',()=>{
  const lines=[{sku:'dress_1',quantity:1}];
  assert.throws(()=>checkRentalCartAvailability({...base,lines,catalog:[...catalog,catalog[0]]}),RangeError);
  assert.throws(()=>checkRentalCartAvailability({...base,lines,holds:[{sku:'missing',quantity:1,start,end}]}),RangeError);
  assert.throws(()=>checkRentalCartAvailability({...base,lines:[{sku:'dress_1',quantity:Number.MAX_SAFE_INTEGER},{sku:'dress_1',quantity:1}]}),RangeError);
  assert.throws(()=>checkRentalCartAvailability({...base,lines,start:'2026-02-30'}),RangeError);
});
test('rejects overbooked existing holds even on another product',()=>{
  const lines=[{sku:'dress_1',quantity:1}];
  assert.throws(()=>checkRentalCartAvailability({...base,lines,holds:[{sku:'veil-2',quantity:3,start,end}]}),RangeError);
});
