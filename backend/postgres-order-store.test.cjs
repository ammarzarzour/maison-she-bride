'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPostgresOrderStore}=require('./postgres-order-store.cjs');
function harness(fail, responder) {
 const calls=[]; let released=false,releaseError;
 const client={
  async query(sql,values){
   calls.push({sql,values});
   if(fail && fail(sql)) throw new Error('SIMULATED_FAILURE');
   return responder?.(sql,values) || {rows:[],rowCount:1};
  },
  release(error){released=true;releaseError=error;}
 };
 return {calls,store:createPostgresOrderStore({connect:async()=>client}),
   released:()=>released,releaseError:()=>releaseError};
}
test('all queries share one connection and commit before resolving',async()=>{
 const h=harness();
 const result=await h.store.transaction(async tx=>{
  await tx.lockRequest('buyer','key');
  return 7;
 });
 assert.equal(result,7);
 assert.match(h.calls[0].sql,/BEGIN/);
 assert.equal(h.calls.at(-1).sql,'COMMIT');
 assert.deepEqual(h.calls.find(c=>c.sql.includes('advisory')).values,['msb-order:buyer:key']);
 assert.equal(h.released(),true);
});
test('callback failure rolls back and keeps the original error',async()=>{
 const h=harness(); const error=new Error('CALLBACK_FAILURE');
 await assert.rejects(h.store.transaction(async()=>{throw error;}),e=>e===error);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK'); assert.equal(h.released(),true);
 assert.equal(h.calls.some(c=>c.sql==='COMMIT'),false);
});
test('failed rollback discards the pooled connection',async()=>{
 const h=harness(sql=>sql==='ROLLBACK');
 await assert.rejects(h.store.transaction(async()=>{throw new Error('ORIGINAL');}),/ORIGINAL/);
 assert.ok(h.releaseError()); assert.equal(h.released(),true);
});
test('commit error is not success and discards the connection',async()=>{
 const h=harness(sql=>sql==='COMMIT');
 await assert.rejects(h.store.transaction(async()=>1),/SIMULATED_FAILURE/);
 assert.ok(h.releaseError()); assert.equal(h.released(),true);
});
test('short inventory update aborts before commit',async()=>{
 const h=harness(null,sql=>sql.startsWith('UPDATE')?{rows:[],rowCount:0}:null);
 await assert.rejects(h.store.transaction(tx=>tx.reserveInventory([{product_id:'p',quantity:2}])),/INVENTORY_CONFLICT/);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
});
test('product reads request row locks and preserve decimal text',async()=>{
 const h=harness(); await h.store.transaction(tx=>tx.lockProducts(['p']));
 const q=h.calls.find(c=>c.sql.startsWith('SELECT p.'));
 assert.match(q.sql,/price_usd::text/);
 assert.match(q.sql,/ORDER BY p.id FOR UPDATE OF p FOR SHARE OF s/);
 assert.deepEqual(q.values,[['p']]);
});
test('order item failure rolls back the order transaction',async()=>{
 const oid='00000000-0000-0000-0000-000000000001';
 const h=harness(null,sql=>sql.startsWith('INSERT INTO public.orders')?
  {rows:[{id:oid}],rowCount:1}:sql.startsWith('INSERT INTO public.order_items')?{rows:[],rowCount:0}:null);
 await assert.rejects(h.store.transaction(tx=>tx.insertOrder({
  order:{buyer_id:'b',status:'pending',currency:'USD',fx_per_usd:'1.000000',total_amount:'0.30'},
  items:[{product_id:'p',quantity:3,unit_price_usd:'0.10'}]
 })),/ITEM_INSERT_FAILED/);
 assert.equal(h.calls.at(-1).sql,'ROLLBACK');
 const q=h.calls.find(c=>c.sql.startsWith('INSERT INTO public.orders'));
 assert.deepEqual(q.values,['b','pending','USD','1.000000','0.30']);
});
test('rejects use of a transaction handle after commit',async()=>{
 const h=harness(); let saved;
 await h.store.transaction(async tx=>{saved=tx;});
 await assert.rejects(saved.findRequest('b','k'),/TRANSACTION_CLOSED/);
 assert.equal(h.calls.at(-1).sql,'COMMIT');
});
test('retry mapping lookups and writes are parameterized and buyer scoped',async()=>{
 const h=harness(); const record={buyer_id:'b',key:'k',fingerprint:'f',order_id:'o'};
 await h.store.transaction(async tx=>{
  await tx.findRequest(record.buyer_id,record.key);
  await tx.rememberRequest(record);
 });
 const find=h.calls.find(c=>c.sql.includes('SELECT fingerprint'));
 assert.deepEqual(find.values,['b','k']);
 const insert=h.calls.find(c=>c.sql.startsWith('INSERT INTO private.'));
 assert.deepEqual(insert.values,['b','k','f','o']);
});
