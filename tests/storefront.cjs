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
    handlers:{},addEventListener(type,handler){this.handlers[type]=handler},setAttribute(k,v){attrs[k]=v},
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

vm.runInContext("items=Array.from({length:53},(_,i)=>({id:'item-'+i,cat:'bridal',ar:'فستان '+i,en:'Dress '+i,usd:i+1,stock:2,icon:'✦'}));filter='all';sortBy='featured';savedOnly=false;catalogPage=0;render()",ctx);
const displayedCards=()=>((node('products').innerHTML.match(/<article class="card">/g)||[]).length);
assert.equal(displayedCards(),24,'first page must contain 24 product cards');
assert.equal(node('pageStatus').textContent,'Page 1 of 3');
assert.equal(node('prevPage').disabled,true);
node('nextPage').onclick();
assert.equal(displayedCards(),24);
assert.ok(node('products').innerHTML.includes('data-save="item-24"'));
assert.equal(node('pageStatus').textContent,'Page 2 of 3');
node('nextPage').onclick();
assert.equal(displayedCards(),5,'last page should show remaining five cards');
assert.equal(node('nextPage').disabled,true);
node('nextPage').onclick();
assert.equal(node('pageStatus').textContent,'Page 3 of 3','cannot advance past the final page');
node('sortProducts').onchange({target:{value:'priceDesc'}});
assert.equal(node('pageStatus').textContent,'Page 1 of 3','sorting should reset the page');
assert.ok(node('products').innerHTML.includes('data-save="item-52"'));
node('nextPage').onclick();
node('search').value='Dress 52';
node('search').handlers.input();
assert.equal(node('pageStatus').textContent,'Page 1 of 1','search should reset and clamp pagination');
assert.equal(displayedCards(),1);
node('search').value='';
node('search').handlers.input();
node('categories').handlers.click({target:{closest:()=>({dataset:{cat:'bags'}})}});
assert.equal(node('pageStatus').textContent,'Page 1 of 1');
assert.equal(displayedCards(),0);
vm.runInContext("filter='all';langSetting='ar';render()",ctx);
assert.equal(node('pageStatus').textContent,'الصفحة 1 من 3');
console.log('PASS bilingual product paging, navigation, sort, search and category reset');

console.log('PASS Maison wishlist persistence, saved filter, price ordering, language and empty catalog');
