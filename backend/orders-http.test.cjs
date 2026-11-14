'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOrdersHandler,createSupabaseTokenVerifier,OrderHttpError}=require('./orders-http.cjs');
const buyer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',pid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const key='cccccccc-cccc-cccc-cccc-cccccccccccc',oid='dddddddd-dddd-dddd-dddd-dddddddddddd';
function fixture({authError,storeError}={}){
 let calls=0,verified=0,record,prior;
 const tx={async lockRequest(){},async findRequest(){return prior;},
 async lockProducts(){return [{id:pid,status:'published',store_status:'approved',stock:5,price_usd:'1.25'}];},
 async reserveInventory(){},async insertOrder(p){record=p;return oid;},async rememberRequest(r){prior=r;}};
 const handler=createOrdersHandler({
  store:{transaction:async fn=>{calls++;if(storeError)throw storeError;return fn(tx);}},
  verifyAccessToken:async token=>{verified++;assert.equal(token,'test-token');if(authError)throw authError;return {id:buyer};},
  allowedOrigins:['https://shop.example']
 });
 return {handler,calls:()=>calls,verified:()=>verified,record:()=>record};
}
function request(body={items:[{product_id:pid,quantity:2}]},headers={},method='POST'){
 return new Request('https://api.example/orders',{method,headers:{
 'Content-Type':'application/json',Authorization:'Bearer test-token','Idempotency-Key':key,...headers},
 ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
test('creates exact order with authenticated identity and returns only order reference',async()=>{
 const f=fixture();const r=await f.handler(request());assert.equal(r.status,201);
 assert.deepEqual(await r.json(),{order_id:oid,replayed:false});
 assert.equal(f.record().order.buyer_id,buyer);assert.equal(f.record().order.total_amount,'2.50');
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('same request key returns previous order',async()=>{
 const f=fixture();await f.handler(request());const r=await f.handler(request());
 assert.equal(r.status,200);assert.equal((await r.json()).replayed,true);
});
test('missing authorization never reaches storage',async()=>{
 const f=fixture();assert.equal((await f.handler(request(undefined,{Authorization:''}))).status,401);
 assert.equal(f.calls(),0);assert.equal(f.verified(),0);
});
test('expired session never reaches storage',async()=>{
 const f=fixture({authError:new OrderHttpError(401,'UNAUTHORIZED')});
 assert.equal((await f.handler(request())).status,401);assert.equal(f.calls(),0);
});
test('rejects forged buyer and malformed body',async()=>{
 const f=fixture();
 for(const body of [{items:[],buyer_id:buyer},'{bad',[],null]){
  assert.equal((await f.handler(request(body))).status,400);
 }
 assert.equal(f.calls(),0);
});
test('rejects oversized streamed body without storage',async()=>{
 const f=fixture();const r=await f.handler(request('x'.repeat(16385)));
 assert.equal(r.status,413);assert.equal(f.calls(),0);
});
test('requires JSON and a valid retry key',async()=>{
 const f=fixture();
 assert.equal((await f.handler(request(undefined,{'content-type':'text/plain'}))).status,415);
 assert.equal((await f.handler(request(undefined,{'idempotency-key':'bad'}))).status,400);
 assert.equal(f.calls(),0);
});
test('origin allowlist is exact and preflight is read-only',async()=>{
 const f=fixture();
 assert.equal((await f.handler(request(undefined,{origin:'https://shop.example.attacker'}))).status,403);
 const r=await f.handler(request(undefined,{origin:'https://shop.example'},'OPTIONS'));
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://shop.example');
 assert.equal(f.calls(),0);assert.equal(f.verified(),0);
});
test('unexpected database errors never expose private details',async()=>{
 const f=fixture({storeError:new Error('postgres://secret-password@example.internal/private')});
 const r=await f.handler(request());assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:'ORDER_SERVICE_UNAVAILABLE'});
});
test('expected inventory conflicts use a stable safe response',async()=>{
 const f=fixture({storeError:new Error('INSUFFICIENT_STOCK')});
 const r=await f.handler(request());assert.equal(r.status,409);
 assert.deepEqual(await r.json(),{error:'INSUFFICIENT_STOCK'});
});
test('Supabase verifier calls getUser with token and ignores editable metadata',async()=>{
 const verify=createSupabaseTokenVerifier({auth:{async getUser(token){
  assert.equal(token,'test-token');return {data:{user:{id:buyer,user_metadata:{id:oid,role:'admin'}}},error:null};
 }}});
 assert.deepEqual(await verify('test-token'),{id:buyer});
});
test('Supabase verifier rejects invalid sessions and anonymous users',async()=>{
 for(const result of [{error:{status:401}},{data:{user:{id:buyer,is_anonymous:true}},error:null},{data:{user:null},error:null}]){
  const verify=createSupabaseTokenVerifier({auth:{getUser:async()=>result}});
  await assert.rejects(verify('test-token'),error=>error.status===401);
 }
});
test('Supabase outages fail closed and do not masquerade as successful authentication',async()=>{
 const verify=createSupabaseTokenVerifier({auth:{getUser:async()=>{throw new Error('private network details');}}});
 await assert.rejects(verify('test-token'),error=>error.status===503&&error.code==='AUTH_UNAVAILABLE');
});
