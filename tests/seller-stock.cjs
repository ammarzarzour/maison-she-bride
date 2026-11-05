const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('const STOCK_EDIT_ENABLED=false;'),'inventory writes must stay disabled without a narrow DB grant');
assert.match(html,/تعديل المخزون غير مفعّل حالياً/);
assert.match(html,/id="apply"[^>]*disabled/, 'store application button must be disabled without INSERT permission');
assert.match(html,/id="saveProduct"[^>]*disabled/, 'product create button must be disabled without INSERT permission');
assert.match(script,/const SELLER_MUTATIONS_ENABLED=false;/, 'seller mutation handlers must be gated');

class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.disabled=false;this.attributes={};this.className='';this.innerHTML='';this.classList={add(){},remove(){}};}
 append(...xs){this.children.push(...xs);}
 replaceChildren(...xs){this.children=xs;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,value){this.attributes[name]=value;}
}
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)}
const document={getElementById:node,createElement:tag=>new Element(tag),documentElement:{lang:'ar',dir:'rtl'},querySelectorAll:()=>[]};
const localStorage={getItem:()=>null,setItem(){}};
const requests=[];
const products=[
 {id:'draft-one',title_ar:'فستان',title_en:'Dress',price_usd:20,stock:1,status:'draft'},
 {id:'live-one',title_ar:'حقيبة',title_en:'Bag',price_usd:40,stock:5,status:'published'}
];
async function fetch(url,opts={}){
 const method=opts.method||'GET';
 requests.push({url,method,headers:opts.headers,body:opts.body});
 assert.equal(method,'GET','inventory summary must never mutate data');
 assert.ok(url.includes('/rest/v1/products?'),'only the seller product list may be requested');
 assert.equal(new URL(url).searchParams.get('store_id'),'eq.store-test');
 assert.equal(opts.headers.Authorization,'Bearer fixture-auth');
 return {ok:true,text:async()=>JSON.stringify(products)};
}
const context=vm.createContext({document,fetch,FormData,URL,navigator:{language:'ar-SY'},localStorage});
vm.runInContext(script,context,{filename:'seller.html#script'});
vm.runInContext("token='fixture-auth';user={id:'owner-test'};store={id:'store-test',status:'approved'}",context);
function badges(){return node('stockSummary').children.map(x=>x.textContent)}
async function run(){
 await vm.runInContext('loadProducts()',context);
 const requestCount=requests.length;
 await node('apply').onclick();
 assert.equal(requests.length,requestCount, 'application cannot write without permission');
 assert.match(node('msg').textContent,/غير مفعّلة/);
 await node('productForm').onsubmit({preventDefault(){}});
 assert.equal(requests.length,requestCount, 'product cannot be saved without permission');
 assert.match(node('msg').textContent,/غير مفعّل/);
 assert.equal(node('products').children.length,2);
 assert.deepEqual(badges(),['المسودات: 1','المنشورة: 1','مخزون منخفض (1–3): 1','نفد المخزون: 0']);
 for(const card of node('products').children)assert.equal(card.children.some(x=>x.className==='stock-controls'),false,'no nonfunctional stock controls may be displayed');
 const before=requests.length;
 await vm.runInContext("updateDraftStock({id:'draft-one',status:'draft'},{value:'2'},{disabled:false})",context);
 assert.equal(requests.length,before,'disabled inventory edit must not contact the server');
 assert.match(node('msg').textContent,/غير مفعّل/);

 products[0].stock=0;products[1].stock=2;
 await vm.runInContext('loadProducts()',context);
 assert.deepEqual(badges(),['المسودات: 1','المنشورة: 1','مخزون منخفض (1–3): 1','نفد المخزون: 1']);
 products[1].status='archived';
 await vm.runInContext('loadProducts()',context);
 assert.deepEqual(badges(),['المسودات: 1','المنشورة: 0','مخزون منخفض (1–3): 1','نفد المخزون: 1']);
 assert.equal(node('stockSummary').children.length,4);
 node('logout').onclick();
 assert.equal(badges().length,0,'summary must clear when the seller logs out');
 console.log('PASS seller inventory counts, low/zero stock warnings, read-only access and blocked stock edits');
}
run().catch(e=>{console.error(e);process.exitCode=1});
