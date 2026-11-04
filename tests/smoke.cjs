const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const pages = ['index.html', 'seller.html', 'admin.html', 'sanad-preview.html', 'sanad-admin-preview.html'];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<meta\s+name="viewport"/i, file + ': missing mobile viewport');
  assert.match(html, /<html[^>]*lang=/i, file + ': missing language');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [i, match] of scripts.entries()) {
    if (match[1].trim()) new vm.Script(match[1], {filename: file + '#script-' + i});
  }
  console.log('PASS', file, scripts.length, 'script blocks');
}
const admin = fs.readFileSync('admin.html', 'utf8');
for (const status of ['pending','confirmed','shipped','delivered','cancelled']) {
  assert.ok(admin.includes("'"+status+"'"), 'admin missing order status: ' + status);
}
assert.ok(!admin.includes("['processing'"), 'unsupported processing order status');
console.log('PASS admin order statuses');

const storefront = fs.readFileSync('index.html', 'utf8');
assert.match(storefront, /const escapeHTML=/, 'missing HTML escaping');
assert.match(storefront, /escapeHTML\(p\[l\]\)/, 'product titles must be escaped');
assert.match(storefront, /escapeHTML\(p\[lang\(\)\]\)/, 'cart product titles must be escaped');
assert.match(storefront, /const safeImage=/, 'product image URLs must be validated');
console.log('PASS storefront content escaping');

assert.match(storefront, /function reconcileCart\(\)/, 'cart must reconcile against catalog');
assert.match(storefront, /stock:Number\(p\.stock\)/, 'live stock must be read');
assert.match(storefront, /Math\.min\(maxQty\(p\)/, 'cart must enforce stock limit');
assert.ok(!storefront.includes("cart={};localStorage.removeItem('msb_cart')"), 'catalog reload must not clear the cart');
console.log('PASS persistent cart and stock limits');

assert.match(storefront, /tx\.stock\+': '\+maxQty\(p\)/, 'stock availability must be visible');
assert.match(storefront, /function renderCart\(\)\{let tx=t\(\),sum=0,count=0;reconcileCart\(\)/, 'cart totals must use reconciled quantities');
console.log('PASS visible stock and reconciled totals');

assert.match(storefront, /id="refreshCatalog"/, 'catalog refresh button must exist');
assert.match(storefront, /async function refreshCatalog\(\)/, 'catalog refresh handler must exist');
assert.match(storefront, /if\(catalogLoading\)return/, 'avoid overlapping catalog refreshes');
assert.match(storefront, /if\(result\.error\)/, 'catalog fetch failure must be handled');
console.log('PASS catalog retry and refresh UI');

const sanad=fs.readFileSync('sanad-preview.html','utf8');
assert.match(sanad, /No real sign-in, submissions/, 'Sanad preview must disclose limitations');
assert.match(sanad, /localStorage\.setItem\('sanad_lang'/, 'Sanad must remember language preference');
assert.match(sanad, /document\.documentElement\.dir=/, 'Sanad must support RTL and LTR');
console.log('PASS Sanad preview safeguards and bilingual UI');

assert.match(sanad, /id="steps"/, 'Sanad request workflow must be visible');
assert.match(sanad, /t\.steps\.map/, 'Sanad workflow must translate');
console.log('PASS Sanad request lifecycle guidance');

assert.match(sanad, /id="serviceSearch"/, 'Sanad must expose service search');
assert.match(sanad, /filtered=t\.services\.filter/, 'Sanad search must filter services');
console.log('PASS Sanad bilingual service search');
