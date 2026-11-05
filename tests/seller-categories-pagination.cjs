const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.match(source,/SELLER_PAGE_SIZE=100,SELLER_MAX_PAGES=10/);
function row(i){return {id:'category-'+i,name_ar:'قسم '+i,name_en:'Category '+i};}
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
  assert.equal(u.pathname,'/rest/v1/categories');
  assert.equal(u.searchParams.get('order'),'name_ar.asc,id.asc');
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
async function run(){
 for(const n of [0,1,99,100,101,200,1000]){
  const a=setup(Array.from({length:n},(_,i)=>row(i)));
  await vm.runInContext('loadCategories()',a.context);
  assert.equal(a.node('category').children.length,n,'complete bilingual options for '+n);
  assert.equal(vm.runInContext('categories.length',a.context),n);
  assert.equal(a.calls.length,Math.floor(n/100)+1);
  for(let i=0;i<a.calls.length;i++)assert.deepEqual(a.calls[i],{offset:i*100,limit:i===10?1:100});
  if(n)assert.match(a.node('category').children[0].textContent,/Category 0 \/ قسم 0/);
 }
 {
  const a=setup(Array.from({length:1001},(_,i)=>row(i)));
  await assert.rejects(vm.runInContext('loadCategories()',a.context),/1000/);
  assert.equal(a.node('category').children.length,0);
  assert.equal(vm.runInContext('categories.length',a.context),0);
 }
 {
  const a=setup(Array.from({length:101},(_,i)=>row(i)),{custom:({offset})=>offset===100?[row(0)]:Array.from({length:100},(_,i)=>row(i))});
  await assert.rejects(vm.runInContext('loadCategories()',a.context),/Invalid products response/);
  assert.equal(a.node('category').children.length,0);
 }
 for(const invalid of [{id:'',name_ar:'قسم',name_en:'Category'},{id:'ok',name_ar:' ',name_en:'Category'},{id:'ok',name_ar:'قسم',name_en:null}]){
  const a=setup([invalid]);
  await assert.rejects(vm.runInContext('loadCategories()',a.context),/Invalid products response/);
  assert.equal(a.node('category').children.length,0);
 }
 {
  const a=setup([],{custom:()=>Array.from({length:101},(_,i)=>row(i))});
  await assert.rejects(vm.runInContext('loadCategories()',a.context),/Invalid products response/);
 }
 {
  const rows=[row(0)],a=setup(rows);
  await vm.runInContext('loadCategories()',a.context);
  assert.equal(a.node('category').children.length,1);
  rows.splice(0,1,...Array.from({length:1001},(_,i)=>row(i)));
  await assert.rejects(vm.runInContext('loadCategories()',a.context),/1000/);
  assert.equal(a.node('category').children.length,0,'no stale category options after failure');
 }
 {
  const a=setup(Array.from({length:150},(_,i)=>row(i)),{defer:true});
  const pending=vm.runInContext('loadCategories()',a.context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.calls.length,2);
  a.node('logout').onclick();
  a.release();
  await pending;
  assert.equal(a.node('category').children.length,0,'logout must not render late private options');
  assert.equal(vm.runInContext('categories.length',a.context),0);
 }
 {
  // Two reads in the same authenticated session: an older, slower page must
  // not replace the newer completed category list.
  const rows=Array.from({length:150},(_,i)=>row(i));
  const a=setup(rows,{defer:true});
  const older=vm.runInContext('loadCategories()',a.context);
  await new Promise(resolve=>setImmediate(resolve));
  rows.splice(0,rows.length,row(900));
  const newer=vm.runInContext('loadCategories()',a.context);
  await newer;
  assert.equal(a.node('category').children.length,1);
  assert.equal(a.node('category').children[0].value,'category-900');
  a.release();
  await older;
  assert.equal(a.node('category').children.length,1,'older category response must not overwrite newer options');
  assert.equal(a.node('category').children[0].value,'category-900');
  assert.equal(vm.runInContext('categories.length',a.context),1);
 }
 console.log('PASS seller bilingual category pagination, overflow, validation, stale state and logout isolation');
}
run().catch(e=>{console.error(e);process.exitCode=1});
