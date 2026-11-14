'use strict';
// Destructive fixture setup is permitted ONLY on the loopback disposable test DB.
// Never supply a Supabase connection string to this test.
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {submitOrder}=require('../order-service.cjs');
const {createPostgresOrderStore}=require('../postgres-order-store.cjs');
const url=new URL(process.env.ORDER_TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/msb_order_test');
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname!=='/msb_order_test')
 throw new Error('DISPOSABLE_LOCAL_DATABASE_REQUIRED');
const pool=new Pool({connectionString:url.href,max:8,application_name:'msb-order-integration'});
const store=createPostgresOrderStore(pool);
const buyer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const buyer2='dddddddd-dddd-dddd-dddd-dddddddddddd';
const pid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const sid='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const key='cccccccc-cccc-cccc-cccc-cccccccccccc';
const key2='ffffffff-ffff-ffff-ffff-ffffffffffff';
const items=(quantity=1)=>[{product_id:pid,quantity}];
before(async()=>{
 const check=await pool.query('SELECT current_database() AS name');
 assert.equal(check.rows[0].name,'msb_order_test');
 await pool.query("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); "+
  "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid'; "+
  "CREATE ROLE anon; CREATE ROLE authenticated;");
 await pool.query(readFileSync(path.join(__dirname,'../schema.sql'),'utf8'));
 await pool.query(readFileSync(path.join(__dirname,'../proposals/order-request-storage.sql'),'utf8'));
});
after(async()=>{await pool.end();});
beforeEach(async()=>{
 await pool.query('TRUNCATE private.order_requests,public.order_items,public.orders,public.products,public.stores,auth.users CASCADE');
 await pool.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[buyer,buyer2]);
 await pool.query("INSERT INTO public.stores(id,name,owner_id,status) VALUES ($1,'Synthetic store',$2,'approved')",[sid,buyer]);
 await pool.query("INSERT INTO public.products(id,store_id,title_ar,title_en,price_usd,stock,status) VALUES ($1,$2,'اختبار','Test',0.10,5,'published')",[pid,sid]);
});
async function state() {
 const r=await pool.query("SELECT (SELECT count(*)::int FROM public.orders) AS orders,"+
 "(SELECT count(*)::int FROM public.order_items) AS items,"+
 "(SELECT count(*)::int FROM private.order_requests) AS requests,"+
 "(SELECT stock FROM public.products WHERE id=$1) AS stock",[pid]);
 return r.rows[0];
}
test('real transaction persists exact totals',async()=>{
 const result=await submitOrder(store,buyer,key,items(3));
 assert.equal(result.replayed,false);
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:2});
 const r=await pool.query('SELECT total_amount::text AS total FROM public.orders WHERE id=$1',[result.order_id]);
 assert.equal(r.rows[0].total,'0.30');
});
test('concurrent same-key requests produce exactly one committed order',async()=>{
 const results=await Promise.all(Array.from({length:6},()=>submitOrder(store,buyer,key,items(2))));
 assert.equal(new Set(results.map(r=>r.order_id)).size,1);
 assert.equal(results.filter(r=>!r.replayed).length,1);
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:3});
});
test('distinct request keys cannot oversell the last item',async()=>{
 await pool.query('UPDATE public.products SET stock=1 WHERE id=$1',[pid]);
 const results=await Promise.allSettled([
  submitOrder(store,buyer,key,items()),submitOrder(store,buyer2,key2,items())
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/INSUFFICIENT_STOCK/);
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:0});
});
test('changed cart with same key is rejected without new writes',async()=>{
 await submitOrder(store,buyer,key,items());
 const before=await state();
 await assert.rejects(submitOrder(store,buyer,key,items(2)),/IDEMPOTENCY_CONFLICT/);
 assert.deepEqual(await state(),before);
});
test('same request key is independent for different buyers',async()=>{
 await Promise.all([submitOrder(store,buyer,key,items()),submitOrder(store,buyer2,key,items())]);
 assert.deepEqual(await state(),{orders:2,items:2,requests:2,stock:3});
});
test('failure after order/items insert rolls back inventory and permits retry',async()=>{
 const failing={transaction:work=>store.transaction(tx=>work({...tx,async insertOrder(p){
  await tx.insertOrder(p); throw new Error('INJECTED_AFTER_INSERT');
 }}))};
 await assert.rejects(submitOrder(failing,buyer,key,items(2)),/INJECTED_AFTER_INSERT/);
 assert.deepEqual(await state(),{orders:0,items:0,requests:0,stock:5});
 await submitOrder(store,buyer,key,items(2));
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:3});
});
test('retry-record failure rolls back all writes',async()=>{
 const failing={transaction:work=>store.transaction(tx=>work({...tx,async rememberRequest(){
  throw new Error('INJECTED_RETRY_RECORD_FAILURE');
 }}))};
 await assert.rejects(submitOrder(failing,buyer,key,items()),/INJECTED_RETRY_RECORD_FAILURE/);
 assert.deepEqual(await state(),{orders:0,items:0,requests:0,stock:5});
});
test('replay returns original order after product archive or price change',async()=>{
 const first=await submitOrder(store,buyer,key,items());
 await pool.query("UPDATE public.products SET status='archived',price_usd=9 WHERE id=$1",[pid]);
 const next=await submitOrder(store,buyer,key,items());
 assert.equal(next.order_id,first.order_id); assert.equal(next.replayed,true);
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:4});
});
test('unapproved store is rejected without a partial order',async()=>{
 await pool.query("UPDATE public.stores SET status='suspended' WHERE id=$1",[sid]);
 await assert.rejects(submitOrder(store,buyer,key,items()),/PRODUCT_UNAVAILABLE/);
 assert.deepEqual(await state(),{orders:0,items:0,requests:0,stock:5});
});
test('committed concurrent store suspension is observed after lock wait',async()=>{
 const blocker=await pool.connect();
 let pending;
 try {
  await blocker.query('BEGIN');
  await blocker.query("UPDATE public.stores SET status='suspended' WHERE id=$1",[sid]);
  // Catch immediately so a failure before the assertion cannot be unhandled.
  pending=submitOrder(store,buyer,key,items()).then(value=>({value}),error=>({error}));
  let waiting=false;
  for(let attempt=0;attempt<60;attempt++){
   const r=await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='msb-order-integration' AND wait_event_type='Lock'");
   if(r.rowCount){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(waiting,true,'order must wait for the store row lock');
  await blocker.query('COMMIT');
  const result=await pending;
  assert.match(result.error?.message || '',/PRODUCT_UNAVAILABLE/);
  assert.deepEqual(await state(),{orders:0,items:0,requests:0,stock:5});
 } finally {
  await blocker.query('ROLLBACK');blocker.release();
  if(pending) await pending;
 }
});

test('request handler creates and replays a real database order with verified test identity',async()=>{
 const {createOrdersHandler}=require('../orders-http.cjs');
 // Test-only verifier. Production must use Supabase getUser, not this fixture.
 const handler=createOrdersHandler({store,verifyAccessToken:async token=>{
  assert.equal(token,'synthetic-test-token');return {id:buyer};
 }});
 const make=()=>new Request('https://orders.example/orders',{method:'POST',headers:{
  Authorization:'Bearer synthetic-test-token','Content-Type':'application/json','Idempotency-Key':key
 },body:JSON.stringify({items:items(2)})});
 const first=await handler(make());assert.equal(first.status,201);
 const created=await first.json();
 const second=await handler(make());assert.equal(second.status,200);
 assert.deepEqual(await second.json(),{order_id:created.order_id,replayed:true});
 const unauthorized=await handler(new Request('https://orders.example/orders',{method:'POST',
  headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({items:items()})}));
 assert.equal(unauthorized.status,401);
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:3});
});

test('real HTTP server commits one PostgreSQL order and safely replays the retry',async t=>{
 const {createOrdersHandler}=require('../orders-http.cjs');
 const {createOrderServer}=require('../runtime/server.cjs');
 const handler=createOrdersHandler({store,verifyAccessToken:async token=>{
  assert.equal(token,'synthetic-http-token');return {id:buyer};
 }});
 const server=createOrderServer({enabled:true,handler});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/orders';
 const options={method:'POST',headers:{Authorization:'Bearer synthetic-http-token',
  'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({items:items(2)})};
 const first=await fetch(url,options);assert.equal(first.status,201);
 const created=await first.json();
 const retry=await fetch(url,options);assert.equal(retry.status,200);
 assert.deepEqual(await retry.json(),{order_id:created.order_id,replayed:true});
 assert.deepEqual(await state(),{orders:1,items:1,requests:1,stock:3});
});
