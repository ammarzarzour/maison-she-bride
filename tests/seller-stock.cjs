const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('seller.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('async function updateDraftStock'), 'draft inventory handler is missing');
assert.match(html,/تعديل المخزون متاح للمسودات فقط/);

class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.disabled=false;this.attributes={};this.className='';this.type='';this.innerHTML='';this.classList={add(){},remove(){}};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,val){this.attributes[name]=val;}
}
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);}
const document={getElementById:node,createElement:tag=>new Element(tag)};
const requests=[];
const products=[
 {id:'draft-one',title_ar:'فستان',title_en:'Dress',price_usd:20,stock:1,status:'draft'},
 {id:'live-one',title_ar:'حقيبة',title_en:'Bag',price_usd:40,stock:5,status:'published'}
];
let returnNoMatch=false;
async function fetch(url,opts={}){
 const method=opts.method||'GET';
 requests.push({url,method,headers:opts.headers,body:opts.body});
 if(method==='GET'&&url.includes('/rest/v1/products?'))return {ok:true,text:async()=>JSON.stringify(products)};
 if(method==='PATCH'&&url.includes('/rest/v1/products?')){
  const query=new URL(url).searchParams;
  assert.equal(query.get('id'),'eq.draft-one', 'PATCH must target a specific draft');
  assert.equal(query.get('store_id'),'eq.store-test', 'PATCH must include seller store');
  assert.equal(query.get('status'),'eq.draft', 'published products must not be editable');
  assert.equal(query.get('select'),'id,stock');
  assert.equal(opts.headers.Authorization,'Bearer fixture-auth');
  assert.equal(opts.headers.Prefer,'return=representation');
  const data=JSON.parse(opts.body);
  assert.deepEqual(Object.keys(data),['stock'],'PATCH must not change status, price or store');
  if(returnNoMatch)return {ok:true,text:async()=>JSON.stringify([])};
  products[0].stock=data.stock;
  return {ok:true,text:async()=>JSON.stringify([{id:products[0].id,stock:products[0].stock}])};
 }
 throw new Error('Unexpected simulated network request '+url);
}
const context=vm.createContext({document,fetch,FormData,URL});
vm.runInContext(script,context,{filename:'seller.html#script'});
vm.runInContext("token='fixture-auth';user={id:'user-test'};store={id:'store-test',status:'approved'}",context);

function draftControls(){
 const draft=node('products').children[0];
 const controls=draft.children.find(x=>x.className==='stock-controls');
 assert.ok(controls,'draft product needs stock controls');
 const label=controls.children[0],field=label.children[0],button=controls.children[1];
 return {field,button};
}
async function run(){
 await vm.runInContext('loadProducts()',context);
 assert.equal(node('products').children.length,2);
 assert.equal(node('products').children[1].children.some(x=>x.className==='stock-controls'),false,'published products must not expose stock editing');
 const first=draftControls();
 assert.equal(first.field.value,'1');
 assert.equal(first.field.min,'0');
 assert.equal(first.button.type,'button');
 assert.equal(first.field.attributes['aria-label'],'مخزون المسودة: فستان');

 for(const invalid of ['-1','1.5','1e3','','-0','2147483648','abc','01']){
  first.field.value=invalid;
  const before=requests.length;
  await first.button.listeners.click();
  assert.equal(requests.length,before,'invalid quantity must not trigger network request: '+invalid);
  assert.match(node('msg').textContent,/كمية صحيحة/);
 }
 first.field.value='0';
 await first.button.listeners.click();
 assert.equal(products[0].stock,0,'draft should support zero stock');
 assert.equal(draftControls().field.value,'0');
 assert.match(node('msg').textContent,/تم حفظ المخزون/);
 const patch=requests.find(r=>r.method==='PATCH');
 assert.ok(patch,'expected scoped PATCH');
 assert.equal(JSON.parse(patch.body).stock,0);

 const control=draftControls();
 control.field.value='3';
 returnNoMatch=true;
 await control.button.listeners.click();
 assert.equal(products[0].stock,0,'zero-row RLS response must not report success');
 assert.match(node('msg').textContent,/لم يتم تعديل المنتج/);
 returnNoMatch=false;
 
 const count=requests.length;
 await vm.runInContext("updateDraftStock({id:'live-one',status:'published'},{value:'10'},{disabled:false})",context);
 assert.equal(requests.length,count,'published products must be rejected before PATCH');
 assert.match(node('msg').textContent,/المسودة فقط/);

 vm.runInContext("token=''",context);
 const noAuthRequests=requests.length;
 await vm.runInContext("updateDraftStock({id:'draft-one',status:'draft'},{value:'2'},{disabled:false})",context);
 assert.equal(requests.length,noAuthRequests,'logged-out seller must not send PATCH');

 vm.runInContext("token='fixture-auth'",context);
 const last=draftControls();last.field.value='7';
 await last.button.listeners.click();
 assert.equal(products[0].stock,7);
 assert.equal(draftControls().field.value,'7');
 assert.match(node('msg').textContent,/تم حفظ المخزون/);
 console.log('PASS seller draft stock edits: scoped RLS REST request, zero quantity, invalid inputs, unpublished-only and zero-row rejection');
}
run().catch(e=>{console.error(e);process.exitCode=1});
