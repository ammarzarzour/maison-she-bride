const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function run() {
  const requests = [];
  const window = {MSB_SUPABASE: {url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  const sandbox = {
    window, AbortController, setTimeout, clearTimeout,
    fetch: async (url, opts) => {
      requests.push({url, opts});
      if (url.includes('/products?')) return {ok:true,json:async()=>[{id:'product-1',title_ar:'فستان'}]};
      if (url.includes('/categories?')) return {ok:true,json:async()=>[{id:'category-1',slug:'bridal'}]};
      return {ok:false,status:404};
    }
  };
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'), sandbox, {filename:'catalog.js'});
  assert.equal(window.MSB_CATALOG.configured, true);
  const products = await window.MSB_CATALOG.products();
  const categories = await window.MSB_CATALOG.categories();
  assert.equal(products.error,null);
  assert.equal(products.rows[0].id,'product-1');
  assert.equal(categories.rows[0].slug,'bridal');
  assert.equal(requests.length,2);
  assert.ok(requests[0].url.includes('status=eq.published'));
  assert.ok(requests[0].url.includes('stock=gt.0'));
  assert.equal(requests[0].opts.headers.apikey,window.MSB_SUPABASE.publishableKey);
  console.log('PASS catalog published/in-stock product requests');

  const bad = {MSB_SUPABASE:{url:'http://example.supabase.co',publishableKey:'service_role_secret'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{window:bad,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('must not fetch')}});
  assert.equal(bad.MSB_CATALOG.configured,false);
  const disabled = await bad.MSB_CATALOG.products();
  assert.equal(disabled.configured,false);
  console.log('PASS catalog rejects invalid public configuration');
}
run().catch(e=>{console.error(e);process.exitCode=1});
