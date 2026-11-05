const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const nodes=new Map(),storage=new Map([['msb_cart',JSON.stringify({dress:2})]]);
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const classes=new Set();
 const el={
  textContent:'',innerHTML:'',value:'',disabled:false,
  options:id==='sortProducts'?[{},{},{},{}]:[],
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle(v,on){if(on)classes.add(v);else classes.delete(v)}},
  addEventListener(){},setAttribute(){},scrollIntoView(){}
 };
 nodes.set(id,el);return el;
}
const document={getElementById:node,documentElement:{},addEventListener(){}};
const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
const window={MSB_CATALOG:{configured:false}};
const context=vm.createContext({document,window,localStorage,navigator:{language:'en-GB'},Intl,URL});
vm.runInContext(scripts[0],context);
vm.runInContext(scripts.at(-1),context);
const product={id:'dress',category_id:'bridal-id',title_ar:'فستان',title_en:'Dress',price_usd:12,stock:2,product_images:[]};
const category={id:'bridal-id',slug:'bridal',name_ar:'عرائس',name_en:'Bridal'};
const ok=rows=>({configured:true,rows,error:null});
const api={configured:true,products:async()=>ok([product]),categories:async()=>ok([category])};
const evalState=expr=>vm.runInContext(expr,context);
async function run(){
 window.MSB_CATALOG=api;
 await evalState('refreshCatalog()');
 assert.equal(evalState('catalogReady'),true);
 assert.match(node('products').innerHTML,/data-save="dress"/);
 assert.equal(node('copyQuote').disabled,false);
 let resolveProducts,resolveCategories;
 window.MSB_CATALOG={
  configured:true,
  products:()=>new Promise(resolve=>{resolveProducts=resolve}),
  categories:()=>new Promise(resolve=>{resolveCategories=resolve})
 };
 const pending=evalState('refreshCatalog()');
 assert.equal(evalState('catalogReady'),false,'must invalidate stock before pending fetch resolves');
 assert.equal(evalState('items.length'),0,'stale product cards cannot be shopped during refresh');
 assert.doesNotMatch(node('products').innerHTML,/data-save="dress"/);
 assert.equal(node('copyQuote').disabled,true,'no stale cart quote during refresh');
 assert.match(node('noResults').textContent,/Loading|Updating|refreshing|products/i);
 assert.equal(node('refreshCatalog').disabled,true);
 assert.equal(JSON.parse(storage.get('msb_cart')).dress,2,'preserve cart while loading');
 resolveProducts(ok([product]));resolveCategories(ok([category]));
 await pending;
 assert.equal(evalState('catalogReady'),true);
 assert.equal(node('copyQuote').disabled,false);
 assert.match(node('products').innerHTML,/data-save="dress"/);
 assert.equal(node('refreshCatalog').disabled,false);

 let rejectProducts;
 window.MSB_CATALOG={configured:true,products:()=>new Promise((resolve,reject)=>{rejectProducts=reject}),categories:async()=>ok([category])};
 const failed=evalState('refreshCatalog()');
 assert.equal(node('copyQuote').disabled,true);
 rejectProducts(new Error('offline'));
 await failed;
 assert.equal(evalState('catalogReady'),false);
 assert.equal(node('copyQuote').disabled,true);
 assert.equal(JSON.parse(storage.get('msb_cart')).dress,2);
 assert.match(node('noResults').textContent,/Could not load products/);
 console.log('PASS pending catalog refresh hides stale stock and quotes, preserves cart, restores after success and fails closed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
