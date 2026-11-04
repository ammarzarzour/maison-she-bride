const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
async function run(){
 const html=fs.readFileSync('index.html','utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 const nodes=new Map(),storage=new Map();
 function node(id){if(!nodes.has(id)){const cls=new Set();nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,options:id==='sortProducts'?[{},{},{},{}]:id==='payment'?[{},{}]:[],classList:{add:x=>cls.add(x),remove:x=>cls.delete(x),toggle(x,b){if(b===undefined?!cls.has(x):b)cls.add(x);else cls.delete(x)}},addEventListener(){},setAttribute(){},scrollIntoView(){}})}return nodes.get(id)}
 const document={getElementById:node,documentElement:{},addEventListener(){}};
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
 const window={MSB_CATALOG:{configured:false}};
 const ctx=vm.createContext({document,localStorage,window,navigator:{language:'ar-SY'},Intl,URL});
 vm.runInContext(scripts[0],ctx);
 vm.runInContext(scripts.at(-1),ctx);
 const category={id:'c1',slug:'evening',name_ar:'فساتين السهرة',name_en:'Evening Dresses'};
 const product={id:'p1',category_id:'c1',title_ar:'فستان',title_en:'Dress',price_usd:50,stock:2,product_images:[]};
 window.MSB_CATALOG={configured:true,categories:async()=>({configured:true,rows:[category],error:null}),products:async()=>({configured:true,rows:[product],error:null})};
 await vm.runInContext('refreshCatalog()',ctx);
 assert.match(node('categories').innerHTML,/فساتين السهرة/);
 assert.match(node('products').innerHTML,/فساتين السهرة/);
 assert.ok(!node('categories').innerHTML.includes('data-cat="women"'),'static categories should not override database categories');
 vm.runInContext("langSetting='en';render()",ctx);
 assert.match(node('categories').innerHTML,/Evening Dresses/);
 assert.match(node('products').innerHTML,/Evening Dresses/);
 vm.runInContext("filter='evening';render()",ctx);
 assert.match(node('products').innerHTML,/Dress/);
 window.MSB_CATALOG.categories=async()=>({configured:true,rows:[],error:null});
 await vm.runInContext('refreshCatalog()',ctx);
 assert.ok(!node('categories').innerHTML.includes('data-cat="evening"'),'stale categories must be removed');
 assert.match(node('categories').innerHTML,/All/);
 console.log('PASS live bilingual categories, filters and refresh');
}
run().catch(e=>{console.error(e);process.exitCode=1});
