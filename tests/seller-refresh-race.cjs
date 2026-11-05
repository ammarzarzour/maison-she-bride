const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('sellerInventoryGeneration'));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function setup(){
 const nodes=new Map(),calls=[];
 class Node{
  constructor(){this.children=[];this.textContent='';this.value='';this.listeners={};this.classList={add(){},remove(){}}}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  addEventListener(name,fn){this.listeners[name]=fn}
  setAttribute(){}
 }
 const getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
 const document={documentElement:{},getElementById,createElement:()=>new Node(),querySelectorAll:()=>[]};
 const context=vm.createContext({document,FormData,URL,navigator:{language:'en-GB'},localStorage:{getItem:()=>null,setItem(){}},
  fetch:async(url,options)=>{
   const u=new URL(url);
   assert.equal(u.pathname,'/rest/v1/products');
   assert.equal(options.method,'GET');
   const gate=deferred();
   calls.push({url,gate});
   await gate.promise;
   return {ok:true,text:async()=>JSON.stringify(gate.rows)};
  }
 });
 vm.runInContext(script,context,{filename:'seller.html'});
 vm.runInContext("token='token';user={id:'owner'};store={id:'shop',status:'approved'}",context);
 return {context,calls,node:getElementById};
}
function row(id){return {id,title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1,status:'draft'};}
async function tick(){await new Promise(resolve=>setImmediate(resolve))}
async function run(){
 // The first refresh is slower; only the later refresh is allowed to publish.
 {
  const a=setup();
  const old=vm.runInContext('loadProducts()',a.context);
  await tick();assert.equal(a.calls.length,1);
  const latest=vm.runInContext('loadProducts()',a.context);
  await tick();assert.equal(a.calls.length,2);
  a.calls[1].gate.rows=[row('new')];a.calls[1].gate.resolve();
  await latest;
  assert.equal(vm.runInContext('cachedSellerProducts[0].id',a.context),'new');
  a.calls[0].gate.rows=[row('old')];a.calls[0].gate.resolve();
  await old;
  assert.equal(vm.runInContext('cachedSellerProducts[0].id',a.context),'new');
  assert.equal(a.node('products').children.length,1);
  assert.match(a.node('products').children[0].children[0].textContent,/Dress/);
 }
 // Even when the first response resolves before the latest one, it cannot
 // publish a temporary stale inventory or request further pages.
 {
  const a=setup();
  const old=vm.runInContext('loadProducts()',a.context);
  await tick();
  const latest=vm.runInContext('loadProducts()',a.context);
  await tick();
  a.calls[0].gate.rows=[row('old')];a.calls[0].gate.resolve();
  await old;
  assert.equal(a.node('products').children.length,0);
  assert.equal(vm.runInContext('cachedSellerProducts',a.context),null);
  a.calls[1].gate.rows=[row('new')];a.calls[1].gate.resolve();
  await latest;
  assert.equal(vm.runInContext('cachedSellerProducts[0].id',a.context),'new');
 }
 // Logging out must still prevent either refresh from repopulating the view.
 {
  const a=setup();
  const old=vm.runInContext('loadProducts()',a.context);
  const latest=vm.runInContext('loadProducts()',a.context);
  await tick();
  a.node('logout').onclick();
  for(const call of a.calls){call.gate.rows=[row('private')];call.gate.resolve()}
  await Promise.all([old,latest]);
  assert.equal(a.node('products').children.length,0);
  assert.equal(vm.runInContext('cachedSellerProducts',a.context),null);
 }
 console.log('PASS seller same-session concurrent inventory refreshes and logout isolation');
}
run().catch(e=>{console.error(e);process.exitCode=1});
