const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
const nodes=new Map(),handlers={};
let active=null;
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const classes=new Set(),attrs={};
 const el={
  id,value:'',textContent:'',innerHTML:'',options:id==='sortProducts'?[{},{},{},{}]:id==='payment'?[{},{}]:[],
  isConnected:true,
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle:(v,b)=>{if(b)classes.add(v);else classes.delete(v)}},
  setAttribute:(k,v)=>{attrs[k]=v},getAttribute:k=>attrs[k],
  addEventListener(){},scrollIntoView(){},focus(){active=el},
  getClientRects(){return [1]},
  contains(other){return other===el||id==='drawer'&&[node('closeCart'),node('cartMinus')].includes(other)},
  querySelectorAll(){return id==='drawer'?[node('closeCart'),node('cartMinus')]:[]}
 };
 nodes.set(id,el);return el;
}
const document={documentElement:{},getElementById:node,addEventListener:(k,fn)=>{handlers[k]=fn},get activeElement(){return active}};
const localStorage={getItem:()=>null,setItem(){}};
const context=vm.createContext({document,localStorage,navigator:{language:'en-US'},Intl,URL});
vm.runInContext(script,context);
const toggle=node('cartToggle'),close=node('closeCart'),last=node('cartMinus');
toggle.focus();toggle.onclick();
assert.equal(active,close,'opening dialog focuses close button');
assert.equal(toggle.getAttribute('aria-expanded'),'true');
assert.equal(node('drawer').classList.contains('open'),true);
let prevented=0;
const tab=(shiftKey=false)=>handlers.keydown({key:'Tab',shiftKey,preventDefault(){prevented++}});
last.focus();tab();assert.equal(active,close,'forward tab wraps to first control');
close.focus();tab(true);assert.equal(active,last,'reverse tab wraps to last control');
handlers.keydown({key:'Escape'});
assert.equal(active,toggle,'Escape returns focus to previous element');
assert.equal(toggle.getAttribute('aria-expanded'),'false');
assert.equal(node('drawer').classList.contains('open'),false);
toggle.onclick();close.onclick();
assert.equal(active,toggle,'close button returns focus');
assert.equal(prevented,2);
console.log('PASS cart dialog keyboard focus, Tab wrap, Escape and focus restoration');
