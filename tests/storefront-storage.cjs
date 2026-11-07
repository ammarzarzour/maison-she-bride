const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('function readCart()'), 'missing cart storage validation');

function setup(initial, blockedWrites = false, blockedReads = false) {
  const saved = new Map(Object.entries(initial));
  const nodes = new Map();
  let activeElement = null;
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
        contains(value) { return classes.has(value); },
        toggle(value, flag) {
          const active = flag === undefined ? !classes.has(value) : flag;
          if (active) classes.add(value); else classes.delete(value);
        }
      },
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      scrollIntoView() {},
      focus() { activeElement = element; },
      // Match the cart's rerendered action buttons for keyboard focus recovery.
      querySelectorAll(selector) {
        if(id!=='cartItems'||selector!=='[data-plus],[data-minus],[data-remove]')return [];
        return [...this.innerHTML.matchAll(/data-(plus|minus|remove)="([^"]+)"/g)].map(match=>({
          dataset:{[match[1]]:match[2]},focus(){activeElement=this}
        }));
      },
      isConnected: true
    };
    nodes.set(id, element);
    return element;
  }
  const document = {getElementById: node, documentElement: {}, addEventListener() {}, get activeElement() { return activeElement; }};
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

// Corrupted or adversarial browser storage must not trigger unbounded cart work.
const oversizedCart=setup({msb_cart: JSON.stringify({dress:1,padding:'x'.repeat(17000)})});
assert.deepEqual(oversizedCart.cart(), {}, 'oversized stored payload rejected');
const manyEntries=Object.fromEntries(Array.from({length:150},(_,i)=>['item'+i,1]));
const boundedCart=setup({msb_cart: JSON.stringify(manyEntries)});
assert.equal(Object.keys(boundedCart.cart()).length,100,'at most 100 cart lines restored');
const emptyIdCart=setup({msb_cart:'{"":2,"dress":1}'});
assert.deepEqual(emptyIdCart.cart(),{dress:1},'empty item identifiers rejected');

const dirty = setup({msb_cart: JSON.stringify({
  dress: 99999, missing: 3, zero: 0, negative: -5, fraction: 2.5,
  absurd: Number.MAX_SAFE_INTEGER + 1, __proto__: 5
})});
assert.deepEqual(dirty.cart(), {dress: 99, missing: 3});
dirty.loadProducts();
assert.deepEqual(dirty.cart(), {dress: 2}, 'cart must respect actual stock after live catalog loads');
assert.deepEqual(JSON.parse(dirty.saved.get('msb_cart')), {dress: 2});
assert.equal(dirty.node('cartTotal').textContent, vm.runInContext("t().total+': '+price(60)", dirty.context), 'totals must remain correct');

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
// Removing an entire cart row must not depend on checkout or any network request.
const removal = setup({msb_cart: '{"dress":2}'});
removal.loadProducts();
assert.match(removal.node('cartItems').innerHTML, /data-remove="dress"/);
assert.match(removal.node('cartItems').innerHTML, /إزالة من السلة/);
removal.node('cartItems').handlers.click({target: {
  closest(selector) { return selector === '[data-remove]' ? {dataset: {remove: 'dress'}} : null; }
}});
assert.deepEqual(removal.cart(), {});
assert.deepEqual(JSON.parse(removal.saved.get('msb_cart')), {});
assert.equal(removal.node('cartCount').textContent, 0);
vm.runInContext("langSetting='en';cart.dress=1;renderCart()", removal.context);
assert.match(removal.node('cartItems').innerHTML, /Remove from cart/);
// Clipboard failures must leave a copyable, local-only cart summary.
const copyStart=script.indexOf("$('copyQuote').onclick=async()=>");
assert.ok(copyStart>=0,'copy handler exists');
const copyHandler=script.slice(copyStart,script.indexOf(';render(',copyStart));
assert.ok(copyHandler.includes("const preview=$('quotePreview')"),'fallback uses local readonly summary');
assert.ok(copyHandler.includes('preview.focus()'),'focuses summary');
assert.ok(copyHandler.includes('preview.select()'),'selects summary for manual copy');
assert.ok(copyHandler.includes("t().quoteCopyFailed"),'translated failure message');
assert.ok(!copyHandler.includes('fetch(')&&!copyHandler.includes('request('),'no network request in copy flow');
console.log('PASS corrupt cart payloads, stock reconciliation, prototype safety and unavailable browser storage');
