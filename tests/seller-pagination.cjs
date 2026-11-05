const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.match(source,/SELLER_PAGE_SIZE=100,SELLER_MAX_PAGES=10/);
function setup(rows,options={}){
 const nodes=new Map(),calls=[];
 class Node{
  constructor(){this.children=[];this.textContent='';this.value='';this.listeners={};this.classList={add(){},remove(){}};}
  append(...xs){this.children.push(...xs)}
  replaceChildren(...xs){this.children=xs}
  addEventListener(k,v){this.listeners[k]=v}
  setAttribute(){}
 }
 function node(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)}
 const document={documentElement:{},getElementById:node,createElement:()=>new Node(),querySelectorAll:()=>[]};
 let release;
 const gate=options.defer?new Promise(resolve=>{release=resolve}):null;
 async function fetch(url,opts){
  const u=new URL(url);
  assert.equal(opts.method,'GET');
  assert.equal(u.pathname,'/rest/v1/products');
  assert.equal(u.searchParams.get('store_id'),'eq.store-1');
  assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');
  const limit=Number(u.searchParams.get('limit')),offset=Number(u.searchParams.get('offset'));
  calls.push({limit,offset});
  if(gate&&offset===100)await gate;
  const data=options.custom?options.custom({limit,offset}):rows.slice(offset,offset+limit);
  return {ok:true,text:async()=>JSON.stringify(data)};
 }
 const context=vm.createContext({document,fetch,FormData,URL,navigator:{language:'en-GB'},localStorage:{getItem:()=>null,setItem(){}}});
 vm.runInContext(source,context);
 vm.runInContext("token='test-token';user={id:'owner-1'};store={id:'store-1',status:'approved'}",context);
 return {context,node,calls,release};
}
function row(i){return {id:'item-'+i,title_ar:'منتج '+i,title_en:'Item '+i,price_usd:10,stock:i%4,status:i%2?'published':'draft'};}
async function run(){
 for(const n of [0,1,99,100,101,200,1000]){
  const a=setup(Array.from({length:n},(_,i)=>row(i)));
  await vm.runInContext('loadProducts()',a.context);
  assert.equal(a.node('products').children.length,n,'all rows must render for '+n);
  assert.equal(vm.runInContext('cachedSellerProducts.length',a.context),n);
  assert.equal(a.calls.length,Math.floor(n/100)+1);
  for(let i=0;i<a.calls.length;i++)assert.deepEqual(a.calls[i],{offset:i*100,limit:i===10?1:100});
  assert.equal(a.node('stockSummary').children[0].textContent,'Drafts: '+Math.ceil(n/2));
 }
 // Overflow must fail closed, preserving no misleading partial inventory.
 {
  const a=setup(Array.from({length:1001},(_,i)=>row(i)));
  await assert.rejects(vm.runInContext('loadProducts()',a.context),/1000/);
  assert.equal(a.node('products').children.length,0);
  assert.equal(vm.runInContext('cachedSellerProducts',a.context),null);
  assert.deepEqual(a.calls.at(-1),{limit:1,offset:1000});
 }
 // Duplicate IDs across pages are rejected rather than double-counted.
 {
  const a=setup(Array.from({length:101},(_,i)=>row(i)),{custom:({offset})=>offset===100?[row(0)]:Array.from({length:100},(_,i)=>row(i))});
  await assert.rejects(vm.runInContext('loadProducts()',a.context),/Invalid products response/);
  assert.equal(a.node('products').children.length,0);
 }
 // Invalid oversized server responses must not be accepted.
 {
  const a=setup([],{custom:()=>Array.from({length:101},(_,i)=>row(i))});
  await assert.rejects(vm.runInContext('loadProducts()',a.context),/Invalid products response/);
 }
 // Logging out while a later page is pending must not render private rows.
 {
  const a=setup(Array.from({length:150},(_,i)=>row(i)),{defer:true});
  const pending=vm.runInContext('loadProducts()',a.context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.calls.length,2);
  a.node('logout').onclick();
  a.release();
  await pending;
  assert.equal(a.node('products').children.length,0);
  assert.equal(vm.runInContext('cachedSellerProducts',a.context),null);
 }
 console.log('PASS complete seller inventory paging, 1000 boundary, overflow, duplicates and logout isolation');
}
run().catch(e=>{console.error(e);process.exitCode=1});
