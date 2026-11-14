'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {submitOrder}=require('./order-service.cjs');
const buyer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const buyer2='dddddddd-dddd-dddd-dddd-dddddddddddd';
const pid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const pid2='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const key='cccccccc-cccc-cccc-cccc-cccccccccccc';
const key2='ffffffff-ffff-ffff-ffff-ffffffffffff';
const item=(quantity=1)=>({product_id:pid,quantity});
// Transactional in-memory fake: validates orchestration, NOT PostgreSQL locking.
function fakeStore(stock=5) {
 const store={state:{products:[
  {id:pid,status:'published',store_status:'approved',stock,price_usd:'0.10'},
  {id:pid2,status:'published',store_status:'approved',stock:5,price_usd:'1.25'}
 ],orders:[],requests:[]},failAt:null,calls:0};
 let queue=Promise.resolve();
 store.transaction=fn=>{
  const run=queue.then(async()=>{
   store.calls++;
   const working=structuredClone(store.state);
   let requestLocked=false,productsLocked=false;
   const tx={
    async lockRequest(){requestLocked=true;},
    async findRequest(b,k){
     assert.ok(requestLocked);
     return working.requests.find(r=>r.buyer_id===b&&r.key===k);
    },
    async lockProducts(ids){
     assert.deepEqual(ids,[...ids].sort());
     productsLocked=true;
     return working.products.filter(p=>ids.includes(p.id));
    },
    async reserveInventory(items){
     assert.ok(productsLocked);
     for(const item of items) {
      const p=working.products.find(p=>p.id===item.product_id);
      if(!p||p.stock<item.quantity) throw new Error('INSUFFICIENT_STOCK');
      p.stock-=item.quantity;
     }
     if(store.failAt==='reserve') throw new Error('SIMULATED_RESERVE_FAILURE');
    },
    async insertOrder(prepared){
     if(store.failAt==='insert') throw new Error('SIMULATED_INSERT_FAILURE');
     const order_id='00000000-0000-0000-0000-'+String(working.orders.length+1).padStart(12,'0');
     working.orders.push({id:order_id,...prepared});
     return order_id;
    },
    async rememberRequest(record){
     if(store.failAt==='remember') throw new Error('SIMULATED_REMEMBER_FAILURE');
     working.requests.push(record);
    }
   };
   const result=await fn(tx);
   if(store.failAt==='commit') throw new Error('SIMULATED_COMMIT_FAILURE');
   store.state=working;
   return result;
  });
  queue=run.catch(()=>{});
  return run;
 };
 return store;
}
test('saves order, inventory and retry record together with exact prices',async()=>{
 const s=fakeStore(); const result=await submitOrder(s,buyer,key,[item(3)]);
 assert.equal(result.replayed,false); assert.equal(s.state.orders.length,1);
 assert.equal(s.state.products[0].stock,2); assert.equal(s.state.requests.length,1);
 assert.equal(s.state.orders[0].order.total_amount,'0.30');
});
test('two concurrent submissions with same key create one order',async()=>{
 const s=fakeStore(); const results=await Promise.all([
  submitOrder(s,buyer,key,[item(2)]),submitOrder(s,buyer,key,[item(2)])
 ]);
 assert.equal(results[0].order_id,results[1].order_id);
 assert.deepEqual(results.map(r=>r.replayed),[false,true]);
 assert.equal(s.state.orders.length,1); assert.equal(s.state.products[0].stock,3);
});
test('same key with changed items conflicts without further stock changes',async()=>{
 const s=fakeStore(); await submitOrder(s,buyer,key,[item()]);
 const before=structuredClone(s.state);
 await assert.rejects(submitOrder(s,buyer,key,[item(2)]),/IDEMPOTENCY_CONFLICT/);
 assert.deepEqual(s.state,before);
});
test('item order and UUID casing do not change request identity',async()=>{
 const s=fakeStore(); const items=[item(),{product_id:pid2,quantity:2}];
 const first=await submitOrder(s,buyer,key,items);
 const second=await submitOrder(s,buyer.toUpperCase(),key.toUpperCase(),
  [...items].reverse().map(i=>({...i,product_id:i.product_id.toUpperCase()})));
 assert.equal(second.order_id,first.order_id); assert.equal(second.replayed,true);
});
test('same key is scoped to authenticated buyer',async()=>{
 const s=fakeStore(); await submitOrder(s,buyer,key,[item()]);
 const result=await submitOrder(s,buyer2,key,[item()]);
 assert.equal(result.replayed,false); assert.equal(s.state.orders.length,2);
});
for(const failAt of ['reserve','insert','remember','commit']) {
 test('failure at '+failAt+' rolls back all state and permits retry',async()=>{
  const s=fakeStore(); const before=structuredClone(s.state); s.failAt=failAt;
  await assert.rejects(submitOrder(s,buyer,key,[item(2)]),/SIMULATED/);
  assert.deepEqual(s.state,before);
  s.failAt=null;
  const result=await submitOrder(s,buyer,key,[item(2)]);
  assert.equal(result.replayed,false); assert.equal(s.state.orders.length,1);
  assert.equal(s.state.products[0].stock,3);
 });
}
test('two distinct requests cannot consume the last item twice',async()=>{
 const s=fakeStore(1); const results=await Promise.allSettled([
  submitOrder(s,buyer,key,[item()]),submitOrder(s,buyer,key2,[item()])
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(s.state.orders.length,1); assert.equal(s.state.products[0].stock,0);
});
test('replay succeeds even when the originally purchased product is now unavailable',async()=>{
 const s=fakeStore(1); const first=await submitOrder(s,buyer,key,[item()]);
 s.state.products[0].status='archived';
 const replay=await submitOrder(s,buyer,key,[item()]);
 assert.equal(replay.order_id,first.order_id); assert.equal(replay.replayed,true);
});
test('rejects malicious or malformed input before transaction begins',async()=>{
 const s=fakeStore();
 for(const items of [[],[item(),item()],[{...item(),price_usd:'0.01'}],[item('2')]]) {
  await assert.rejects(submitOrder(s,buyer,key,items));
 }
 await assert.rejects(submitOrder(s,null,key,[item()]));
 await assert.rejects(submitOrder(s,buyer,'',[item()]));
 assert.equal(s.calls,0);
});
test('revalidates current trusted product state inside the transaction',async()=>{
 const s=fakeStore(); s.state.products[0].store_status='suspended';
 await assert.rejects(submitOrder(s,buyer,key,[item()]),/PRODUCT_UNAVAILABLE/);
 assert.equal(s.state.orders.length,0); assert.equal(s.state.requests.length,0);
});
