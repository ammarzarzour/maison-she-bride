const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('function readCart()'), 'missing cart storage validation');

function setup(initial, blockedWrites = false, blockedReads = false) {
  const saved = new Map(Object.entries(initial));
  const nodes = new Map();
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const attrs = {};
    const classes = new Set();
    const element = {
      textContent: '', innerHTML: '', value: '', disabled: false, handlers: {},
      options: id === 'sortProducts' ? [{},{},{},{}] : id === 'payment' ? [{},{}] : [],
      classList: {
        add(value) { classes.add(value); },
        remove(value) { classes.delete(value); },
        toggle(value, flag) {
          const active = flag === undefined ? !classes.has(value) : flag;
          if (active) classes.add(value); else classes.delete(value);
        }
      },
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      scrollIntoView() {}
    };
    nodes.set(id, element);
    return element;
  }
  const document = {getElementById: node, documentElement: {}, addEventListener() {}};
  const localStorage = {
    getItem(key) {
      if (blockedReads) throw new Error('Storage unavailable');
      return saved.get(key) ?? null;
    },
    setItem(key, value) {
      if (blockedWrites) throw new Error('Storage denied');
      saved.set(key, String(value));
    }
  };
  const context = vm.createContext({document, localStorage, navigator: {language: 'ar-SY'}, Intl, URL});
  vm.runInContext(script, context, {filename: 'index.html#storage'});
  const cart = () => JSON.parse(vm.runInContext('JSON.stringify(cart)', context));
  const loadProducts = () => vm.runInContext(
    "items=[{id:'dress',cat:'bridal',ar:'فستان',en:'Dress',usd:30,stock:2,icon:'✦'}];catalogReady=true;reconcileCart();render()",
    context
  );
  return {node, saved, context, cart, loadProducts};
}

for (const bad of ['null', '[]', '5', '"invalid"', '{bad json', '{"dress":-1}']) {
  const app = setup({msb_cart: bad});
  assert.deepEqual(app.cart(), {}, 'must ignore malformed cart: ' + bad);
  app.loadProducts();
  assert.equal(app.node('cartCount').textContent, 0);
}

const dirty = setup({msb_cart: JSON.stringify({
  dress: 99999, missing: 3, zero: 0, negative: -5, fraction: 2.5,
  absurd: Number.MAX_SAFE_INTEGER + 1, __proto__: 5
})});
assert.deepEqual(dirty.cart(), {dress: 99, missing: 3});
dirty.loadProducts();
assert.deepEqual(dirty.cart(), {dress: 2}, 'cart must respect actual stock after live catalog loads');
assert.deepEqual(JSON.parse(dirty.saved.get('msb_cart')), {dress: 2});
assert.match(dirty.node('cartTotal').textContent, /60/, 'totals must remain correct');

const polluted = setup({msb_cart: '{"__proto__":999,"constructor":2,"prototype":2,"dress":1}'});
assert.deepEqual(polluted.cart(), {dress: 1});
polluted.loadProducts();
assert.equal(vm.runInContext('({}).polluted', polluted.context), undefined);

const blocked = setup({msb_cart: '{"dress":1}'}, true);
blocked.loadProducts();
assert.equal(blocked.node('cartCount').textContent, 1);
blocked.node('products').handlers.click({target: {
  closest(selector) { return selector === '[data-add]' ? {dataset: {add: 'dress'}} : null; }
}});
assert.equal(blocked.cart().dress, 2, 'cart interactions must work in memory when storage writes fail');
blocked.node('products').handlers.click({target: {
  closest(selector) { return selector === '[data-save]' ? {dataset: {save: 'dress'}} : null; }
}});
assert.match(blocked.node('savedToggle').textContent, /\(1\)/, 'wishlist must still work in memory');

const unavailable = setup({}, true, true);
unavailable.loadProducts();
assert.equal(unavailable.node('cartCount').textContent, 0);
assert.match(unavailable.node('products').innerHTML, /data-add="dress"/);
console.log('PASS corrupt cart payloads, stock reconciliation, prototype safety and unavailable browser storage');
