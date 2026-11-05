const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('admin.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('function renderDashboard('),'admin dashboard localization is missing');
const staticKeys=[...html.matchAll(/data-i18n="([^"]+)"/g)].map(x=>x[1]);
assert.ok(staticKeys.length>25,'admin labels should be translated throughout the page');

function setup(deviceLanguage,savedChoice=null,blockedStorage=false){
 const saved=new Map(savedChoice===null?[]:[['msb_admin_lang',savedChoice]]);
 const nodes=new Map();
 class Element{
  constructor(tag='div'){
   this.tag=tag;this.children=[];this.textContent='';this.value='';this.placeholder='';
   this.handlers={};this.className='';this.dataset={};this.attributes={};this.classList={add(){},remove(){}};
  }
  replaceChildren(...v){this.children=v}
  append(...v){this.children.push(...v)}
  setAttribute(k,v){this.attributes[k]=v}
  addEventListener(k,fn){this.handlers[k]=fn}
 }
 function node(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)}
 const labels=staticKeys.map(key=>{const e=new Element();e.dataset.i18n=key;return e});
 const document={
  documentElement:{lang:'ar',dir:'rtl'},
  querySelectorAll(selector){return selector==='[data-i18n]'?labels:[]},
  getElementById:node,createElement:tag=>new Element(tag)
 };
 const localStorage={
  getItem(key){if(blockedStorage)throw Error('blocked storage');return saved.get(key)??null},
  setItem(key,val){if(blockedStorage)throw Error('blocked storage');saved.set(key,String(val))}
 };
 const data={
  counts:{stores:1,pendingStores:1,products:2,draftProducts:1,orders:1},
  stores:[{id:'store1',name:'Demo store',status:'pending',created_at:'2026-11-05T00:00:00Z'}],
  products:[{id:'p1',title_ar:'فستان',title_en:'Dress',price_usd:15,stock:2,status:'draft'},{id:'p2',title_ar:'حقيبة',title_en:'Bag',price_usd:10,stock:1,status:'published'}],
  orders:[{id:'order-123456789',status:'pending',total_amount:25,currency:'USD',invoice_number:'OLD',shipping_carrier:'Old Carrier',tracking_number:'OLDTRACK',created_at:'2026-11-05T00:00:00Z'}]
 };
 const requests=[];
 async function fetch(url,opts={}){
  requests.push({url,opts});
  assert.equal(opts.method,'GET','test must never trigger an admin write');
  assert.ok(url.includes('/functions/v1/admin-console'));
  assert.equal(opts.headers.Authorization,'Bearer test-admin-token');
  return {ok:true,json:async()=>data};
 }
 const context=vm.createContext({document,localStorage,navigator:{language:deviceLanguage},fetch,URL});
 vm.runInContext(script,context,{filename:'admin.html#script'});
 const change=v=>node('language').handlers.change({target:{value:v}});
 const text=key=>labels.find(e=>e.dataset.i18n===key).textContent;
 const orderFields=()=>node('ordersRows').children[0].children[6].children;
 return {context,change,node,document,saved,requests,staticKeys,labels,text,orderFields};
}
async function run(){
 const a=setup('ar-SY');
 assert.equal(a.document.documentElement.dir,'rtl');
 assert.equal(a.node('language').value,'auto');
 assert.equal(a.text('adminLogin'),'دخول الإدارة');
 const dict=JSON.parse(vm.runInContext('JSON.stringify(adminStrings)',a.context));
 for(const key of staticKeys){assert.ok(dict.ar[key],'Missing Arabic: '+key);assert.ok(dict.en[key],'Missing English: '+key);}
 vm.runInContext("token='test-admin-token'",a.context);
 await vm.runInContext("load()",a.context);
 assert.equal(a.requests.length,1);
 assert.equal(a.node('storesRows').children[0].children[1].textContent,'بانتظار الاعتماد');
 assert.equal(a.node('productsRows').children[0].children[3].textContent,'مسودة');
 assert.equal(a.node('ordersRows').children[0].children[1].textContent,'قيد الانتظار');

 // Unsaved shipping edits should survive a language change without triggering an API request.
 const initial=a.orderFields();
 initial[0].value='DRAFT-101';initial[0].handlers.input();
 initial[1].value='My test courier';initial[1].handlers.input();
 initial[2].value='TRACK-DEMO';initial[2].handlers.input();
 initial[3].value='shipped';initial[3].handlers.change();
 a.change('en');
 assert.equal(a.document.documentElement.dir,'ltr');
 assert.equal(a.document.documentElement.lang,'en');
 assert.equal(a.saved.get('msb_admin_lang'),'en');
 assert.equal(a.text('adminLogin'),'Administrator sign-in');
 assert.equal(a.text('recentOrders'),'Recent orders');
 assert.equal(a.node('storesRows').children[0].children[1].textContent,'Pending review');
 assert.equal(a.node('productsRows').children[0].children[3].textContent,'Draft');
 assert.equal(a.node('ordersRows').children[0].children[1].textContent,'Pending');
 assert.equal(a.orderFields()[0].value,'DRAFT-101');
 assert.equal(a.orderFields()[1].value,'My test courier');
 assert.equal(a.orderFields()[2].value,'TRACK-DEMO');
 assert.equal(a.orderFields()[3].value,'shipped');
 assert.equal(a.orderFields()[3].children[2].textContent,'Shipped');
 assert.equal(a.requests.length,1,'switching languages must not re-fetch or save anything');

 a.change('ar');
 assert.equal(a.document.documentElement.dir,'rtl');
 assert.equal(a.orderFields()[0].value,'DRAFT-101');
 assert.equal(a.orderFields()[3].children[2].textContent,'تم الشحن');
 assert.equal(a.requests.length,1);

 a.change('bad-value');
 assert.equal(a.node('language').value,'auto');
 assert.equal(a.document.documentElement.lang,'ar');
 assert.equal(a.saved.get('msb_admin_lang'),'auto');

 const restored=setup('en-GB','ar');
 assert.equal(restored.document.documentElement.dir,'rtl','saved manual language overrides device language');
 const en=setup('en-GB','auto');
 assert.equal(en.document.documentElement.dir,'ltr');
 assert.equal(en.text('login'),'Sign in');
 const invalid=setup('ar-SY','bogus');
 assert.equal(invalid.document.documentElement.dir,'rtl');
 assert.equal(invalid.node('language').value,'auto');
 const blocked=setup('en-GB',null,true);
 blocked.change('ar');
 assert.equal(blocked.document.documentElement.dir,'rtl','language must work even if storage is blocked');

 a.node('logout').onclick();
 assert.equal(vm.runInContext('lastDashboard',a.context),null);
 assert.equal(vm.runInContext('shippingDrafts.size',a.context),0,'unsaved shipping state should be cleared on logout');
 console.log('PASS admin AR/EN language, saved auto preference, server-free switching, and unsaved shipment drafts');
}
run().catch(err=>{console.error(err);process.exitCode=1});
