const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script,'storefront script exists');
const elements=new Map();
let focused=null;
function node(id){
 if(elements.has(id))return elements.get(id);
 const el={
  value:'',textContent:'',disabled:false,handlers:{},options:id==='sortProducts'?[{},{},{},{}]:[],
  classList:{add(){},remove(){},toggle(){}},setAttribute(){},
  addEventListener(type,fn){this.handlers[type]=fn},scrollIntoView(){},focus(){focused=this},
  _html:'',set innerHTML(value){this._html=value},get innerHTML(){return this._html},
  querySelectorAll(selector){
   if(id!=='cartItems'||selector!=='[data-plus],[data-minus],[data-remove]')return [];
   return [...this._html.matchAll(/data-(plus|minus|remove)="([^"]+)"/g)].map((match)=>{
    const control={dataset:{[match[1]]:match[2]},focus(){focused=control}};
    return control;
   });
  }
 };
 elements.set(id,el);return el;
}
const document={documentElement:{},getElementById:node,addEventListener(){}};
const localStorage={getItem(){return null},setItem(){}};
const context=vm.createContext({document,navigator:{language:'en-GB'},localStorage,Intl,URL});
vm.runInContext(script,context,{filename:'index.html'});
vm.runInContext("items=[{id:'dress',cat:'bridal',ar:'فستان',en:'Dress',usd:10,stock:2,icon:'✦'}];catalogReady=true;cart={dress:1};render()",context);
const cart=node('cartItems');
assert.match(cart.innerHTML,/aria-label="Increase quantity of Dress"/);
assert.match(cart.innerHTML,/aria-label="Decrease quantity of Dress"/);
assert.match(cart.innerHTML,/aria-label="Remove from cart Dress"/);
assert.match(cart.innerHTML,/aria-label="Quantity 1"/);
assert.match(cart.innerHTML,/type="button"/);
const target=(kind,id)=>({closest:selector=>selector==='[data-'+kind+']'?{dataset:{[kind]:id}}:null});
cart.handlers.click({target:target('plus','dress')});
assert.match(cart.innerHTML,/Quantity 2/);
assert.equal(focused.dataset.plus,'dress','focus follows the newly rendered increment button');
cart.handlers.click({target:target('plus','dress')});
assert.match(cart.innerHTML,/Quantity 2/,'quantity cannot exceed live stock');
assert.equal(focused.dataset.plus,'dress');
cart.handlers.click({target:target('minus','dress')});
assert.match(cart.innerHTML,/Quantity 1/);
assert.equal(focused.dataset.minus,'dress','decrement button receives focus after redraw');
cart.handlers.click({target:target('minus','dress')});
assert.equal(focused,node('closeCart'),'focus falls back to close button when the last row is removed');
assert.match(cart.innerHTML,/Your cart is empty/);
assert.equal(node('copyQuote').disabled,true,'no quote for empty cart');
vm.runInContext("cart={dress:2};renderCart()",context);
cart.handlers.click({target:target('remove','dress')});
assert.match(cart.innerHTML,/Your cart is empty/);
assert.equal(focused,node('closeCart'),'remove button restores focus safely');
focused=null;
cart.handlers.click({target:target('plus','unknown')});
assert.equal(focused,null,'unknown product cannot steal focus');
vm.runInContext("cart={dress:1};langSetting='ar';render()",context);
assert.match(cart.innerHTML,/aria-label="زيادة كمية فستان"/);
assert.match(cart.innerHTML,/aria-label="تقليل كمية فستان"/);
assert.match(cart.innerHTML,/aria-label="الكمية 1"/);
assert.equal(document.documentElement.dir,'rtl');
console.log('PASS bilingual accessible quantity controls, stock bounds, focus restoration and removed-row fallback');
