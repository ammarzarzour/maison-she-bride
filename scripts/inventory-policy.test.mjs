import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStock, checkRentalAvailability } from './inventory-policy.mjs';
test('stock preflight never writes or authorizes', () => {
  assert.deepEqual(checkStock({ available: 3, requested: 2 }), { eligible: true, remaining: 1, authorized: false, persisted: false });
  assert.equal(checkStock({ available: 1, requested: 2 }).eligible, false);
  for (const requested of [0, -1, 1.5, Number.MAX_SAFE_INTEGER+1]) assert.throws(() => checkStock({available: 3, requested}), RangeError);
});
test('rental overlap and half-open boundary', () => {
  const holds = [{start:'2026-12-01',end:'2026-12-04',quantity:1},{start:'2026-12-03',end:'2026-12-06',quantity:1}];
  assert.equal(checkRentalAvailability({units:2,start:'2026-12-02',end:'2026-12-05',holds}).eligible,false);
  assert.equal(checkRentalAvailability({units:2,start:'2026-12-06',end:'2026-12-08',holds}).eligible,true);
  assert.equal(checkRentalAvailability({units:3,start:'2026-12-02',end:'2026-12-05',holds}).peakReserved,2);
});
test('simultaneous release and hold does not overcount', () => {
  const holds=[{start:'2026-12-01',end:'2026-12-03',quantity:1},{start:'2026-12-03',end:'2026-12-05',quantity:1}];
  assert.equal(checkRentalAvailability({units:2,start:'2026-12-01',end:'2026-12-05',holds}).eligible,true);
});
test('invalid dates, quantities and holds are rejected', () => {
  const base={units:2,start:'2026-12-01',end:'2026-12-05'};
  for (const value of ['2026-02-30','2026-12-05','2026-13-01']) assert.throws(() => checkRentalAvailability({...base,start:value}),RangeError);
  assert.throws(() => checkRentalAvailability({...base,holds:[{start:'2026-12-01',end:'2026-12-02',quantity:-1}]}),RangeError);
  assert.throws(() => checkRentalAvailability({...base,units:-1}),RangeError);
});

test('existing overbooked rental holds fail closed', () => {
  const base={units:2,start:'2026-12-01',end:'2026-12-10'};
  assert.throws(() => checkRentalAvailability({...base,holds:[{start:'2026-12-02',end:'2026-12-08',quantity:3}]}),RangeError);
  assert.throws(() => checkRentalAvailability({...base,holds:[{start:'2026-12-02',end:'2026-12-08',quantity:2},{start:'2026-12-03',end:'2026-12-05',quantity:1}]}),RangeError);
  assert.equal(checkRentalAvailability({...base,holds:[{start:'2026-12-02',end:'2026-12-05',quantity:2},{start:'2026-12-05',end:'2026-12-08',quantity:2}]}).eligible,false);
});
