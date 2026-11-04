const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const pages = ['index.html', 'seller.html', 'admin.html'];
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
