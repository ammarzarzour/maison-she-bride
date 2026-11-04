const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function run() {
  const html = fs.readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts[0]?.includes('function render()'));
  assert.ok(scripts.at(-1)?.includes('async function refreshCatalog()'));

  const storage = new Map([['msb_cart', JSON.stringify({dress: 2})]]);
  const nodes = new Map();
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    const element = {
      textContent: '', innerHTML: '', value: '', disabled: false,
      options: id === 'sortProducts' ? [{},{},{},{}] : id === 'payment' ? [{},{}] : [],
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : force;
          if (enabled) classes.add(name); else classes.delete(name);
        }
      },
      addEventListener() {}, setAttribute() {}, scrollIntoView() {}
    };
    nodes.set(id, element);
    return element;
  }
  const document = {getElementById: node, documentElement: {}, addEventListener() {}};
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const window = {MSB_CATALOG: {configured: false}};
  const context = vm.createContext({window, document, localStorage, navigator: {language: 'ar-SY'}, Intl, URL});
  vm.runInContext(scripts[0], context, {filename: 'index.html#storefront'});
  vm.runInContext(scripts.at(-1), context, {filename: 'index.html#catalog-refresh'});

  const product = {
    id: 'dress', category_id: 'bridal-id',
    title_ar: 'فستان تجريبي', title_en: 'Demo Dress',
    price_usd: 32, stock: 2, product_images: []
  };
  const goodProducts = async () => ({configured: true, rows: [product], error: null});
  const goodCategories = async () => ({configured: true, rows: [{id: 'bridal-id', slug: 'bridal'}], error: null});
  const goodApi = {configured: true, products: goodProducts, categories: goodCategories};
  function hasProducts() { return node('products').innerHTML.includes('data-save="dress"'); }
  function ready() { return vm.runInContext('catalogReady', context); }
  function itemsCount() { return vm.runInContext('items.length', context); }
  async function refresh(api) {
    window.MSB_CATALOG = api;
    await vm.runInContext('refreshCatalog()', context);
  }

  await refresh(goodApi);
  assert.equal(ready(), true);
  assert.equal(itemsCount(), 1);
  assert.equal(hasProducts(), true);
  assert.equal(node('products').innerHTML.includes('فستان تجريبي'), true);
  assert.equal(JSON.parse(storage.get('msb_cart')).dress, 2);

  for (const [reason, api] of [
    ['category request error', {configured: true, products: goodProducts, categories: async () => ({configured: true, rows: [], error: '403'})}],
    ['product request error', {configured: true, products: async () => ({configured: true, rows: [], error: '503'}), categories: goodCategories}],
    ['malformed categories', {configured: true, products: goodProducts, categories: async () => ({configured: true, rows: null, error: null})}],
    ['rejected request', {configured: true, products: goodProducts, categories: async () => { throw new Error('offline'); }}],
    ['disabled connection', {configured: false}]
  ]) {
    await refresh(goodApi); // Start each failure case with a visible valid catalog.
    assert.equal(hasProducts(), true);
    await refresh(api);
    assert.equal(ready(), false, reason);
    assert.equal(itemsCount(), 0, reason);
    assert.equal(hasProducts(), false, reason);
    assert.equal(node('noResults').classList.contains('hidden'), false, reason);
    assert.match(node('noResults').textContent, /تعذّر/, reason);
    vm.runInContext("langSetting='en';render()", context);
    assert.equal(node('noResults').textContent, 'Could not load products. Please retry', 'error persists in English');
    assert.equal(node('results').textContent, 'Could not load products. Please retry');
    vm.runInContext("langSetting='ar';render()", context);
    assert.match(node('noResults').textContent, /تعذّر/, 'error persists in Arabic');
    assert.equal(JSON.parse(storage.get('msb_cart')).dress, 2, 'cart must survive a temporary catalog failure');
  }

  await refresh(goodApi);
  assert.equal(ready(), true, 'a successful retry restores the catalog');
  assert.equal(hasProducts(), true);
  console.log('PASS catalog refresh errors hide stale cards, preserve cart and allow retry');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
