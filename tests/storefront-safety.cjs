const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('function render()'), 'storefront script is missing');

const nodes = new Map();
const storage = new Map();
function node(id) {
  if (nodes.has(id)) return nodes.get(id);
  const attrs = {};
  const element = {
    textContent: '', innerHTML: '', value: '', disabled: false,
    options: id === 'sortProducts' ? [{},{},{},{}] : id === 'payment' ? [{},{}] : [],
    classList: {add() {}, remove() {}, toggle() {}},
    addEventListener() {}, setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name]; }, scrollIntoView() {}
  };
  nodes.set(id, element);
  return element;
}

const document = {getElementById: node, documentElement: {}, addEventListener() {}};
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); }
};
const product = {
  id: 'dress" data-forged="yes',
  cat: '<em data-forged="yes">unsafe label</em>',
  ar: '<b>اسم</b>',
  en: '<b>Title</b>',
  usd: 12, stock: 2, icon: '✦'
};
const ctx = vm.createContext({
  document, localStorage, navigator: {language: 'ar-SY'},
  Intl, URL, fixture: product
});
vm.runInContext(script, ctx, {filename: 'index.html#storefront'});
vm.runInContext('items=[fixture];catalogReady=true;cart={[fixture.id]:1};render()', ctx);

const products = node('products').innerHTML;
const cart = node('cartItems').innerHTML;
assert.ok(products.includes('&lt;em data-forged=&quot;yes&quot;&gt;unsafe label&lt;/em&gt;'),
  'category label should be HTML-escaped');
assert.ok(!products.includes('<em data-forged="yes">'), 'raw markup must not appear in categories');
assert.ok(products.includes('&lt;b&gt;اسم&lt;/b&gt;'), 'product title should remain escaped');
assert.ok(!products.includes('<b>اسم</b>'), 'raw markup must not appear in product names');

assert.ok(cart.includes('data-minus="dress&quot; data-forged=&quot;yes"'),
  'quantity decrement button ID should be escaped');
assert.ok(cart.includes('data-plus="dress&quot; data-forged=&quot;yes"'),
  'quantity increment button ID should be escaped');
assert.ok(!cart.includes('data-minus="dress" data-forged="yes"'),
  'unescaped attributes must not appear in cart controls');
assert.ok(!cart.includes('data-plus="dress" data-forged="yes"'),
  'unescaped attributes must not appear in cart controls');

vm.runInContext("langSetting='en';render()", ctx);
assert.ok(node('products').innerHTML.includes('&lt;em data-forged=&quot;yes&quot;&gt;'),
  'category labels must remain escaped in English mode');
assert.ok(node('cartItems').innerHTML.includes('data-minus="dress&quot; data-forged=&quot;yes"'),
  'cart IDs must remain escaped in English mode');
console.log('PASS storefront escapes category labels, titles and cart data attributes in AR/EN');
