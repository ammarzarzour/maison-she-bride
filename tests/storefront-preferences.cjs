const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const main = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)][0]?.[1];
assert.ok(main?.includes('supportedCurrencies'), 'Expected validated storefront preferences');

function createStore(initial, browserLanguage) {
  const state = new Map(Object.entries(initial));
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const attrs = {};
      nodes.set(id, {
        value: '', textContent: '', innerHTML: '', disabled: false,
        options: id === 'sortProducts' ? [{},{},{},{}] : id === 'payment' ? [{},{}] : [],
        classList: {add() {}, remove() {}, toggle() {}},
        addEventListener() {}, setAttribute(key, value) { attrs[key] = value; },
        getAttribute(key) { return attrs[key]; }, scrollIntoView() {}
      });
    }
    return nodes.get(id);
  }
  const document = {getElementById: node, documentElement: {}, addEventListener() {}};
  const localStorage = {
    getItem(key) { return state.get(key) ?? null; },
    setItem(key, value) { state.set(key, String(value)); }
  };
  const context = vm.createContext({document, navigator: {language: browserLanguage}, localStorage, Intl, URL});
  vm.runInContext(main, context, {filename: 'index.html#preferences'});
  vm.runInContext("items=[{id:'p',cat:'bridal',ar:'فستان',en:'Dress',usd:10,stock:2,icon:'✦'}];catalogReady=true;render()", context);
  return {document, node, state, context};
}

const invalid = createStore({msb_lang: 'bad-lang', msb_currency: 'bad-currency'}, 'ar-SY');
assert.equal(invalid.document.documentElement.dir, 'rtl', 'bad language must fall back to device Arabic');
assert.equal(invalid.node('language').value, 'auto');
assert.equal(invalid.node('currency').value, 'SYP');
assert.match(invalid.node('products').innerHTML, /SYP/);
assert.doesNotMatch(invalid.node('products').innerHTML, /NaN|undefined/, 'bad stored currency must not show invalid prices');
invalid.node('currency').onchange({target: {value: 'SAR'}});
invalid.node('language').onchange({target: {value: 'en'}});
assert.equal(invalid.document.documentElement.dir, 'ltr');
assert.equal(invalid.node('currency').value, 'SAR');
assert.match(invalid.node('products').innerHTML, /SAR/);
assert.equal(invalid.state.get('msb_currency'), 'SAR');
assert.equal(invalid.state.get('msb_lang'), 'en');
invalid.node('currency').onchange({target: {value: 'fake'}});
assert.equal(invalid.node('currency').value, 'SYP');
assert.equal(invalid.state.get('msb_currency'), 'SYP');
invalid.node('language').onchange({target: {value: 'invalid'}});
assert.equal(invalid.node('language').value, 'auto');
assert.equal(invalid.document.documentElement.dir, 'rtl');

const english = createStore({msb_lang: 'auto', msb_currency: 'USD'}, 'en-GB');
assert.equal(english.document.documentElement.dir, 'ltr');
assert.equal(english.node('language').value, 'auto');
assert.equal(english.node('currency').value, 'USD');
assert.match(english.node('products').innerHTML, /USD/);
console.log('PASS invalid language/currency preferences fall back safely; manual selections persist; AR/EN and currencies render');
