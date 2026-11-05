const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(source?.includes('renderSellerLanguage();'),'seller UI needs language initialization');
const uiKeys=[...html.matchAll(/data-i18n="([^"]+)"/g)].map(m=>m[1]);
const placeholders=[...html.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map(m=>m[1]);
assert.ok(uiKeys.length>=25,'seller static markup must have translation keys');

function setup(language='ar-SY',savedPreference=null,denyStorage=false){
 const saved=new Map(savedPreference===null?[]:[['msb_seller_lang',savedPreference]]);
 const elements=new Map();
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.innerHTML='';this.disabled=false;this.className='';this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  append(...xs){this.children.push(...xs)}
  replaceChildren(...xs){this.children=xs}
  addEventListener(name,fn){this.listeners[name]=fn}
  setAttribute(name,value){this[name]=value}
 }
 function node(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)}
 const nodes=uiKeys.map(key=>{const x=new Element('span');x.dataset.i18n=key;return x});
 const placeholderNodes=placeholders.map(key=>{const x=new Element('input');x.dataset.i18nPlaceholder=key;return x});
 const document={
  documentElement:{lang:'ar',dir:'rtl'},
  getElementById:node,createElement:tag=>new Element(tag),
  querySelectorAll:selector=>selector==='[data-i18n]'?nodes:selector==='[data-i18n-placeholder]'?placeholderNodes:[]
 };
 const localStorage={
  getItem:key=>denyStorage?(()=>{throw Error('blocked')})():saved.get(key)??null,
  setItem(key,value){if(denyStorage)throw Error('blocked');saved.set(key,String(value))}
 };
 const products=[
  {id:'draft',title_ar:'فستان',title_en:'Dress',price_usd:20,stock:2,status:'draft'},
  {id:'live',title_ar:'حقيبة',title_en:'Bag',price_usd:12,stock:0,status:'published'}
 ];
 const requests=[];
 async function fetch(url,opts={}){
  const method=opts.method||'GET';
  requests.push({url,method});
  assert.equal(method,'GET','language switching must not submit writes');
  assert.ok(url.includes('/rest/v1/products?'),'unexpected request when switching language');
  return {ok:true,text:async()=>JSON.stringify(products)};
 }
 const context=vm.createContext({document,localStorage,navigator:{language},fetch,FormData,URL});
 vm.runInContext(source,context,{filename:'seller.html#main'});
 const translation=(key)=>nodes.find(x=>x.dataset.i18n===key).textContent;
 const change=value=>node('language').listeners.change({target:{value}});
 return {saved,document,node,nodes,placeholderNodes,products,requests,context,translation,change};
}
async function run(){
 const ar=setup('ar-SY');
 assert.equal(ar.document.documentElement.lang,'ar');
 assert.equal(ar.document.documentElement.dir,'rtl');
 assert.equal(ar.node('language').value,'auto');
 assert.equal(ar.translation('authTitle'),'تسجيل الدخول للتاجر');
 assert.equal(ar.translation('writeNotice').includes('غير مفعّلة'),true);
 assert.equal(ar.placeholderNodes[0].placeholder,'اسم المتجر');
 for(const key of uiKeys){
  assert.ok(ar.translation(key)&&ar.translation(key)!==key,'missing Arabic dictionary value '+key);
 }
 ar.change('en');
 assert.equal(ar.node('language').value,'en');
 assert.equal(ar.document.documentElement.dir,'ltr');
 assert.equal(ar.translation('authTitle'),'Seller sign-in');
 assert.equal(ar.translation('writeNotice').includes('disabled'),true);
 assert.equal(ar.translation('saveDisabled'),'Save product draft (not enabled)');
 assert.equal(ar.placeholderNodes[0].placeholder,'Store name');
 assert.equal(ar.saved.get('msb_seller_lang'),'en');
 for(const key of uiKeys){
  assert.ok(ar.translation(key)&&ar.translation(key)!==key,'missing English dictionary value '+key);
 }

 vm.runInContext("token='dummy-token';user={id:'owner'};store={id:'store-demo',status:'approved'}",ar.context);
 await vm.runInContext('loadProducts()',ar.context);
 assert.equal(ar.requests.length,1);
 assert.equal(ar.node('stockSummary').children[0].textContent,'Drafts: 1');
 assert.equal(ar.node('stockSummary').children[2].textContent,'Low stock (1–3): 1');
 assert.equal(ar.node('stockSummary').children[3].textContent,'Out of stock: 1');
 assert.ok(ar.node('products').children[0].children[0].textContent.startsWith('Dress'));
 assert.ok(ar.node('products').children[1].children[1].textContent.includes('Published'));
 assert.equal(ar.node('products').children[0].children.some(x=>x.className==='stock-controls'),false,'writes must stay disabled');

 ar.change('ar');
 assert.equal(ar.document.documentElement.dir,'rtl');
 assert.equal(ar.node('stockSummary').children[0].textContent,'المسودات: 1');
 assert.ok(ar.node('products').children[0].children[0].textContent.startsWith('فستان'));
 assert.ok(ar.node('products').children[1].children[1].textContent.includes('منشور'));
 assert.equal(ar.requests.length,1,'manual language switch must not query Supabase again');
 assert.equal(ar.saved.get('msb_seller_lang'),'ar');
 ar.change('bogus');
 assert.equal(ar.node('language').value,'auto');
 assert.equal(ar.document.documentElement.lang,'ar');
 assert.equal(ar.saved.get('msb_seller_lang'),'auto');

 vm.runInContext("store=null;user={id:'no-store',email:'seller@example.invalid'};renderSellerLanguage()",ar.context);
 assert.ok(ar.node('storeStatus').textContent.includes('غير مفعّلة'),'no-store warning should be localized in Arabic');
 ar.change('en');
 assert.ok(ar.node('storeStatus').textContent.includes('not enabled'),'no-store warning should be localized in English');
 assert.equal(ar.requests.length,1,'switching no-store language should remain offline');

 const restored=setup('en-GB','ar');
 assert.equal(restored.document.documentElement.dir,'rtl','explicit selection overrides browser locale');
 const autoEnglish=setup('en-GB','auto');
 assert.equal(autoEnglish.document.documentElement.dir,'ltr');
 assert.equal(autoEnglish.translation('authTitle'),'Seller sign-in');
 const invalid=setup('ar-SY','unsupported');
 assert.equal(invalid.node('language').value,'auto');
 assert.equal(invalid.document.documentElement.lang,'ar');
 const blocked=setup('en-GB',null,true);
 blocked.change('ar');
 assert.equal(blocked.document.documentElement.dir,'rtl','storage failure must not stop language switching');
 console.log('PASS seller AR/EN auto selection, persisted setting, localized labels, inventory, and read-only switching');
}
run().catch(error=>{console.error(error);process.exitCode=1});
