const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const main=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];

for(const field of ['customerName','customerPhone','customerAddress','payment']){
 assert.doesNotMatch(html,new RegExp('id="'+field+'"'),'no personal/payment inputs in demo quote');
}
assert.match(html,/id="quotePreview"[^>]*readonly/,'summary must be read-only');
assert.match(html,/id="copyQuote"[^>]*disabled/,'copy must start disabled');
assert.ok(main?.includes('function cartQuoteText()'));

const elements=new Map(),memory=new Map();
const written=[];
function node(id){
 if(elements.has(id))return elements.get(id);
 const el={
  value:'',textContent:'',innerHTML:'',disabled:false,
  options:id==='sortProducts'?[{},{},{},{}]:[],
  classList:{add(){},remove(){},toggle(){}},
  handlers:{},addEventListener(k,fn){this.handlers[k]=fn},
  setAttribute(){},scrollIntoView(){}
 };
 elements.set(id,el);return el;
}
const document={getElementById:node,documentElement:{},addEventListener(){}};
const localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value))};
const navigator={language:'en-GB',clipboard:{async writeText(value){written.push(value)}}};
const context=vm.createContext({document,localStorage,navigator,Intl,URL});
vm.runInContext(main,context,{filename:'index.html#main'});

async function run(){
 assert.equal(node('copyQuote').disabled,true,'empty/unloaded catalog must not generate a quote');
 assert.match(node('quotePreview').value,/Add products/);
 await node('copyQuote').onclick();
 assert.equal(written.length,0,'empty cart must not call clipboard');

 vm.runInContext("items=[{id:'dress',cat:'bridal',ar:'فستان \\n طويل',en:'Evening \\n Dress',usd:10,stock:2,icon:'✦'},{id:'bag',cat:'bags',ar:'حقيبة',en:'Bag',usd:20,stock:4,icon:'✦'}];catalogReady=true;cart={dress:2,bag:1};render()",context);
 assert.equal(node('copyQuote').disabled,false);
 assert.match(node('quotePreview').value,/Demo cart summary/);
 assert.match(node('quotePreview').value,/Evening Dress × 2/);
 assert.doesNotMatch(node('quotePreview').value,/Evening \n Dress/,'product names must be kept on one line');
 assert.match(node('quotePreview').value,/4,800 SYP/,'default stored currency is SYP');
 node('currency').onchange({target:{value:'USD'}});
 assert.match(node('quotePreview').value,/40 USD/,'changing currency updates demo quote');
 assert.match(node('quotePreview').value,/No real orders or payments/);
 assert.equal(node('quotePreview').value.includes('\n'),true,'display a readable multiline summary');
 await node('copyQuote').onclick();
 assert.equal(written.length,1);
 assert.equal(written[0],node('quotePreview').value);
 assert.match(node('checkoutMessage').textContent,/copied/);

 node('currency').onchange({target:{value:'SAR'}});
 assert.match(node('quotePreview').value,/SAR/);
 assert.doesNotMatch(node('quotePreview').value,/NaN/);
 node('language').onchange({target:{value:'ar'}});
 assert.match(node('quotePreview').value,/ملخص السلة التجريبي/);
 assert.match(node('quotePreview').value,/فستان طويل × 2/);
 assert.match(node('quotePreview').value,/SAR/);
 assert.equal(document.documentElement.dir,'rtl');

 navigator.clipboard.writeText=async()=>{throw new Error('Clipboard permission denied')};
 await node('copyQuote').onclick();
 assert.match(node('checkoutMessage').textContent,/تعذّر النسخ/);
 assert.ok(node('quotePreview').value.length>0,'manual selection remains possible');

 vm.runInContext("catalogReady=false;render()",context);
 assert.equal(node('copyQuote').disabled,true,'no quote on temporary catalog outage');
 assert.match(node('quotePreview').value,/أضف منتجات/);
 const before=written.length;
 await node('copyQuote').onclick();
 assert.equal(written.length,before);

 vm.runInContext("catalogReady=true;cart={};render()",context);
 assert.equal(node('copyQuote').disabled,true,'no quote for empty cart');
 console.log('PASS bilingual non-identifying demo cart summary, stock reconciliation, currency, clipboard fallback and no payments');
}
run().catch(e=>{console.error(e);process.exitCode=1});
