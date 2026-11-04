const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
assert.ok(inline[0]?.includes('function render()'),'storefront script missing');

const storage=new Map([['msb_cart',JSON.stringify({dress:3,missing:2})]]);
const nodes=new Map();
function node(id){
  if(nodes.has(id))return nodes.get(id);
  const attrs={};
  const elem={
    value:'',textContent:'',innerHTML:'',disabled:false,
    options:id==='sortProducts'?[{},{},{},{}]:id==='payment'?[{},{}]:[],
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(){},setAttribute(k,v){attrs[k]=v},
    getAttribute(k){return attrs[k]},scrollIntoView(){},
  };
  nodes.set(id,elem);return elem;
}
const document={getElementById:node,documentElement:{},addEventListener(){}};
const localStorage={
  getItem(k){return storage.has(k)?storage.get(k):null},
  setItem(k,v){storage.set(k,String(v))},
};
const ctx=vm.createContext({document,navigator:{language:'ar-SY'},localStorage,Intl,URL});
vm.runInContext(inline[0],ctx,{filename:'index.html#main'});
assert.deepEqual(JSON.parse(storage.get('msb_cart')),{dress:3,missing:2},'startup must not erase the cart before catalog loads');
vm.runInContext("items=[{id:'dress',cat:'bridal',ar:'فستان',en:'Dress',usd:90,stock:2,icon:'✦'},{id:'bag',cat:'bags',ar:'حقيبة',en:'Bag',usd:20,stock:5,icon:'✦'}];catalogReady=true;reconcileCart();render()",ctx);
assert.deepEqual(JSON.parse(storage.get('msb_cart')),{dress:2},'live catalog should clamp quantities to stock and remove missing items');
assert.ok(node('products').innerHTML.includes('data-save="dress"'));
assert.ok(node('products').innerHTML.includes('data-save="bag"'));
vm.runInContext("favorites.add('dress');saveFavorites();savedOnly=true;render()",ctx);
assert.deepEqual(JSON.parse(storage.get('msb_favorites')),['dress']);
assert.ok(node('products').innerHTML.includes('data-save="dress"'));
assert.ok(!node('products').innerHTML.includes('data-save="bag"'));
assert.equal(node('savedToggle').getAttribute('aria-pressed'),'true');
vm.runInContext("savedOnly=false;sortBy='priceAsc';render()",ctx);
assert.ok(node('products').innerHTML.indexOf('data-save="bag"')<node('products').innerHTML.indexOf('data-save="dress"'));
vm.runInContext("sortBy='priceDesc';render()",ctx);
assert.ok(node('products').innerHTML.indexOf('data-save="dress"')<node('products').innerHTML.indexOf('data-save="bag"'));
vm.runInContext("langSetting='en';sortBy='name';render()",ctx);
assert.equal(document.documentElement.dir,'ltr');
assert.ok(node('savedToggle').textContent.includes('Saved'));
vm.runInContext("items=[];render()",ctx);
assert.ok(node('noResults').textContent.includes('No published products'));
assert.equal(node('checkoutForm').classList.add instanceof Function,true);
console.log('PASS Maison wishlist persistence, saved filter, price ordering, language and empty catalog');
