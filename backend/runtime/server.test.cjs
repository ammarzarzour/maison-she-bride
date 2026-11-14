'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createOrderServer}=require('./server.cjs');
const {readConfig}=require('./config.cjs');
async function listen(server){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return 'http://127.0.0.1:'+server.address().port;
}
const valid=()=>({ORDERS_ENABLED:'true',DATABASE_URL:'postgres://worker:synthetic-password@db.example/test',
 SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',
 ORDER_ALLOWED_ORIGINS:'https://shop.example'});
test('default config is disabled and needs no secrets',()=>{
 assert.equal(readConfig({}).enabled,false);
 assert.equal(readConfig({}).host,'127.0.0.1');
});
test('rejects invalid enable flag and missing active config',()=>{
 assert.throws(()=>readConfig({ORDERS_ENABLED:'yes'}));
 assert.throws(()=>readConfig({ORDERS_ENABLED:'true'}));
});
test('requires explicit HTTPS storefront origins',()=>{
 for(const origin of ['', '*','http://shop.example','https://shop.example/path'])
 assert.throws(()=>readConfig({...valid(),ORDER_ALLOWED_ORIGINS:origin}));
});
test('rejects secret auth keys and non-Supabase auth destination',()=>{
 assert.throws(()=>readConfig({...valid(),SUPABASE_PUBLISHABLE_KEY:'sb_secret_synthetic'}));
 assert.throws(()=>readConfig({...valid(),SUPABASE_URL:'https://example.com'}));
});
test('forbids connection-string SSL overrides',()=>{
 for(const suffix of ['?sslmode=disable','?sslmode=no-verify','?sslcert=x'])
 assert.throws(()=>readConfig({...valid(),DATABASE_URL:valid().DATABASE_URL+suffix}),/SSL_OVERRIDE/);
});
test('accepts explicit configuration without returning it in HTTP responses',()=>{
 const c=readConfig(valid());assert.equal(c.enabled,true);assert.deepEqual(c.origins,['https://shop.example']);
});
test('disabled server rejects writes over real HTTP and reports disabled health',async t=>{
 const server=createOrderServer();t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=await listen(server);
 assert.deepEqual(await (await fetch(url+'/health')).json(),{status:'ok',orders_enabled:false});
 const response=await fetch(url+'/orders',{method:'POST',body:'{}'});
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ORDERS_DISABLED'});
});
test('real HTTP bridge preserves authorization, retry key, JSON body and response',async t=>{
 let seen;
 const server=createOrderServer({enabled:true,handler:async req=>{
  seen={url:req.url,auth:req.headers.get('authorization'),key:req.headers.get('idempotency-key'),body:await req.json()};
  return new Response(JSON.stringify({order_id:'synthetic'}),{status:201,headers:{'content-type':'application/json','cache-control':'no-store'}});
 }});
 t.after(()=>new Promise(resolve=>server.close(resolve)));const url=await listen(server);
 const response=await fetch(url+'/orders',{method:'POST',headers:{
  'content-type':'application/json',authorization:'Bearer synthetic-token','idempotency-key':'synthetic-key'
 },body:JSON.stringify({items:[]})});
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{order_id:'synthetic'});
 assert.deepEqual(seen,{url:'http://orders.internal/orders',auth:'Bearer synthetic-token',key:'synthetic-key',body:{items:[]}});
});
test('bridge hides unexpected handler errors',async t=>{
 const server=createOrderServer({enabled:true,handler:async()=>{throw new Error('synthetic-private-password');}});
 t.after(()=>new Promise(resolve=>server.close(resolve)));const url=await listen(server);
 const response=await fetch(url+'/orders',{method:'POST',body:'{}'});
 assert.equal(response.status,503);assert.equal((await response.text()).includes('password'),false);
});

test('startup works disabled without credentials or database access',async t=>{
 const {start}=require('./start.cjs');
 const runtime=await start({PORT:'0'});
 t.after(()=>runtime.close());
 const response=await fetch('http://127.0.0.1:'+runtime.server.address().port+'/health');
 assert.deepEqual(await response.json(),{status:'ok',orders_enabled:false});
});
