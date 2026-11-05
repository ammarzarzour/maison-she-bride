const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(source?.includes('function normalizeSearch('));
const nodes=new Map();
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const el={value:'',textContent:'',innerHTML:'',disabled:false,
  options:id==='sortProducts'?[{},{},{},{}]:[],
  classList:{add(){},remove(){},toggle(){}},
  handlers:{},addEventListener(k,fn){this.handlers[k]=fn},setAttribute(){},scrollIntoView(){}};
 nodes.set(id,el);return el;
}
const document={documentElement:{},getElementById:node,addEventListener(){}};
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
const context=vm.createContext({document,localStorage,navigator:{language:'ar-SY'},Intl,URL});
vm.runInContext(source,context);
vm.runInContext("items=[{id:'p1',cat:'bridal',ar:'فُسْتَان الأَعْرَاس',en:'Wedding Dress',descriptionAr:'حرير ناعم',descriptionEn:'Silk eveningwear',usd:10,stock:2,icon:'✦'},{id:'p2',cat:'women',ar:'عِبَايَة سُورِيَّة',en:'Crème Abaya',usd:15,stock:2,icon:'✦'},{id:'p3',cat:'bags',ar:'حقيبة جلد',en:'Leather Bag',usd:20,stock:2,icon:'✦'}];catalogReady=true;render()",context);
function search(q){node('search').value=q;node('search').handlers.input();return node('products').innerHTML;}
assert.match(search('فستان الاعراس'),/data-add="p1"/);
assert.doesNotMatch(node('products').innerHTML,/data-add="p2"/);
assert.match(search('فستان الأعراس'),/data-add="p1"/);
assert.match(search('فستان الاعراس'),/data-add="p1"/);
assert.match(search('عبايه سوريه'),/data-add="p2"/);
assert.match(search('creme'),/data-add="p2"/);
assert.match(search('CRÈME'),/data-add="p2"/);
assert.match(search('Leather'),/data-add="p3"/);
assert.match(search('حرير'),/data-add="p1"/);
assert.match(search('eveningwear'),/data-add="p1"/);
assert.match(search('bridal'),/data-add="p1"/);
assert.match(search('فساتين الاعراس'),/data-add="p1"/);
assert.doesNotMatch(search('فساتين الاعراس'),/data-add="p2"/);
assert.match(search('  leather   bag  '),/data-add="p3"/);
assert.doesNotMatch(search('nonexistent'),/data-add=/);
assert.equal(node('pageStatus').textContent,'الصفحة 1 من 1');
node('language').onchange({target:{value:'en'}});
assert.equal(document.documentElement.dir,'ltr');
assert.match(search('فستان الاعراس'),/data-add="p1"/);
assert.match(search('creme'),/data-add="p2"/);
console.log('PASS bilingual storefront search across names, descriptions and category labels');
