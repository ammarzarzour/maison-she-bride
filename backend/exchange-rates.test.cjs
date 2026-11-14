'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { convertToNewSyp: convert } = require('./exchange-rates.cjs');
const now = 1800000000000;
// Synthetic rates only, never live market quotes.
const snapshot = () => ({source:'https://www.sp-today.com/', side:'sell', denomination:'new',
  quote:'SYP', observedAtMs:now, rates:{USD:150, SAR:40, AED:41}});
test('converts each approved currency using its own sell rate', () => {
  for (const [currency, rate] of Object.entries(snapshot().rates)) {
    assert.equal(convert(2, currency, snapshot(), now).amount, rate * 2);
  }
});
test('rejects buy rates and old-pound units', () => {
  assert.throws(() => convert(1,'USD',{...snapshot(),side:'buy'},now));
  assert.throws(() => convert(1,'USD',{...snapshot(),denomination:'old'},now));
});
test('rejects stale and future observations, permits exact freshness boundary', () => {
  assert.throws(() => convert(1,'USD',{...snapshot(),observedAtMs:now-900001},now));
  assert.throws(() => convert(1,'USD',{...snapshot(),observedAtMs:now+1},now));
  assert.equal(convert(1,'USD',{...snapshot(),observedAtMs:now-900000},now).amount,150);
});
test('rejects missing and inherited rates', () => {
  assert.throws(() => convert(1,'USD',{...snapshot(),rates:{}},now));
  assert.throws(() => convert(1,'USD',{...snapshot(),rates:Object.create({USD:150})},now));
});
test('rejects invalid rates without numeric coercion', () => {
  for (const rate of [0,-1,NaN,Infinity,'150',null,true]) {
    assert.throws(() => convert(1,'USD',{...snapshot(),rates:{USD:rate}},now));
  }
});
test('rejects unsupported currencies and invalid amounts', () => {
  assert.throws(() => convert(1,'EUR',snapshot(),now));
  for (const amount of [-1,NaN,Infinity,'2',null]) assert.throws(() => convert(amount,'USD',snapshot(),now));
  assert.equal(convert(0,'USD',snapshot(),now).amount,0);
});
test('rejects other sources, missing timestamps and unsafe totals', () => {
  assert.throws(() => convert(1,'USD',{...snapshot(),source:'https://example.com'},now));
  assert.throws(() => convert(1,'USD',{...snapshot(),observedAtMs:undefined},now));
  assert.throws(() => convert(Number.MAX_VALUE,'USD',snapshot(),now));
});
test('retains attribution and does not mutate the snapshot', () => {
  const data=snapshot(); const before=JSON.stringify(data);
  const result=convert(2,'SAR',data,now);
  assert.equal(result.observedAtMs,now); assert.equal(result.denomination,'new');
  assert.equal(JSON.stringify(data),before);
});
