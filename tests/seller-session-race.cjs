const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(source?.includes('sellerSessionEpoch'),'seller session generation protection is required');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
function setup(){
 const nodes=new Map(),calls=[],pending=[];
 class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.disabled=false;this.listeners={};this.classList={add(){},remove(){},toggle(){}};}
  append(...xs){this.children.push(...xs)}
  replaceChildren(...xs){this.children=xs}
  addEventListener(type,fn){this.listeners[type]=fn}
  setAttribute(){}
 }
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
 const document={documentElement:{},getElementById:node,createElement:tag=>new Node(tag),querySelectorAll:()=>[]};
 const fetch=(url,options={})=>{
  const method=options.method||'GET';
  const d=deferred();
  calls.push({url:String(url),method,options});
  pending.push(d);
  return d.promise;
 };
 const context=vm.createContext({document,fetch,localStorage:{getItem:()=>null,setItem(){}},navigator:{language:'en-GB'},FormData,URL});
 vm.runInContext(source,context);
 const finish=(index,data,ok=true)=>pending[index].resolve({ok,status:ok?200:403,text:async()=>JSON.stringify(data)});
 const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));};
 return {node,context,calls,finish,tick};
}
async function run(){
 // A response arriving after logout must not put private inventory back into DOM or cache.
 {
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'};store={id:'store-A',status:'approved'}",a.context);
  const loading=vm.runInContext('loadProducts()',a.context);
  assert.equal(a.calls.length,1);
  assert.equal(new URL(a.calls[0].url).searchParams.get('store_id'),'eq.store-A');
  a.node('logout').onclick();
  a.finish(0,[{id:'secret',title_ar:'خاص',title_en:'Private inventory',stock:1,price_usd:10,status:'draft'}]);
  await loading;
  assert.equal(a.node('products').children.length,0);
  assert.equal(a.node('stockSummary').children.length,0);
  assert.equal(vm.runInContext('cachedSellerProducts',a.context),null);
  assert.equal(vm.runInContext('token',a.context),'');
 }
 // Old account's products must never overwrite a new account's inventory.
 {
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'};store={id:'store-A',status:'approved'}",a.context);
  const old=vm.runInContext('loadProducts()',a.context);
  a.node('logout').onclick();
  vm.runInContext("token='token-B';user={id:'seller-B'};store={id:'store-B',status:'approved'}",a.context);
  const current=vm.runInContext('loadProducts()',a.context);
  a.finish(1,[{id:'current',title_ar:'حقيبة',title_en:'New seller bag',stock:2,price_usd:20,status:'published'}]);
  await current;
  assert.equal(a.node('products').children.length,1);
  assert.match(a.node('products').children[0].children[0].textContent,/New seller bag/);
  a.finish(0,[{id:'old',title_ar:'فستان',title_en:'Old seller dress',stock:1,price_usd:10,status:'draft'}]);
  await old;
  assert.equal(a.node('products').children.length,1);
  assert.match(a.node('products').children[0].children[0].textContent,/New seller bag/);
  assert.equal(vm.runInContext('cachedSellerProducts[0].id',a.context),'current');
 }
 // Delayed store and category reads must not reveal data after sign-out.
 {
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'}",a.context);
  const old=vm.runInContext('loadSeller()',a.context);
  a.node('logout').onclick();
  a.finish(0,[{id:'store-A',name:'Old private store',status:'approved'}]);
  await old;
  assert.equal(a.calls.length,1,'logout prevents chained category and product requests');
  assert.equal(a.node('storeStatus').textContent,'');
  assert.equal(a.node('accountPanel').classList.remove instanceof Function,true);
  assert.equal(vm.runInContext('store',a.context),null);
 }
 {
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'};store={id:'store-A',status:'approved'}",a.context);
  const loading=vm.runInContext('loadCategories()',a.context);
  a.node('logout').onclick();
  a.finish(0,[{id:'private-category',name_ar:'خاص',name_en:'Private'}]);
  await loading;
  assert.equal(vm.runInContext('categories.length',a.context),0);
  assert.equal(a.node('category').children.length,0);
 }
 // Invalid store responses must never enable the approved seller panel or fetch inventory.
 for(const invalid of [null,{id:'not-an-array'},[{id:'store-A',name:'',status:'approved'}],[{id:'store-A',name:'Bad store',status:'unknown'}]]){
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'}",a.context);
  const loading=vm.runInContext('loadSeller()',a.context);
  a.finish(0,invalid);
  await loading;
  assert.equal(a.calls.length,1,'invalid store must not trigger category or product reads');
  assert.equal(vm.runInContext('store',a.context),null);
  assert.equal(a.node('products').children.length,0);
  assert.match(a.node('msg').textContent,/Could not load store details/);
 }
 // A delayed login response must not silently reauthenticate after logout.
 {
  const a=setup();
  a.node('email').value='seller@example.invalid';
  a.node('password').value='not-a-real-password';
  const old=a.node('login').onclick();
  assert.equal(a.calls.length,1);
  a.node('logout').onclick();
  a.finish(0,{access_token:'old-login-token',user:{id:'old-user',email:'seller@example.invalid'}});
  await old;
  assert.equal(vm.runInContext('token',a.context),'');
  assert.equal(vm.runInContext('user',a.context),null);
  assert.equal(a.calls.length,1,'stale login cannot chain seller data requests');
 }
 // A rejected old request must not replace the sign-out message.
 {
  const a=setup();
  vm.runInContext("token='token-A';user={id:'seller-A'}",a.context);
  const old=vm.runInContext('loadSeller()',a.context);
  a.node('logout').onclick();
  a.finish(0,{message:'old private error'},false);
  await old;
  assert.match(a.node('msg').textContent,/signed out/);
 }
 console.log('PASS seller session isolation for delayed inventory, store, category, login and error responses');
}
run().catch(e=>{console.error(e);process.exitCode=1});
