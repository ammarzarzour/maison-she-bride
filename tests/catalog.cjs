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


  // Two pages: 100 results followed by a final partial page.
  const pages=[];
  const pagedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  const pagedSandbox={window:pagedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>{
      pages.push(url);
      const offset=Number(new URL(url).searchParams.get('offset'));
      const count=offset===0?100:3;
      return {ok:true,json:async()=>Array.from({length:count},(_,i)=>({id:'p-'+(offset+i)}))};
    }};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),pagedSandbox);
  const many=await pagedWindow.MSB_CATALOG.products();
  assert.equal(many.error,null);
  assert.equal(many.rows.length,103);
  assert.equal(pages.length,2);
  assert.equal(many.rows[102].id,'p-102');
  console.log('PASS catalog paginates more than 100 published products');

  // A failed subsequent page must not masquerade as a complete catalog.
  const failedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:failedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>Number(new URL(url).searchParams.get('offset'))===0
      ?{ok:true,json:async()=>Array.from({length:100},(_,i)=>({id:String(i)}))}
      :{ok:false,status:503}
  });
  const failed=await failedWindow.MSB_CATALOG.products();
  assert.equal(failed.rows.length,0);
  assert.ok(failed.error);
  console.log('PASS catalog refuses partial results on pagination errors');

  // Boundary: exactly 1000 products is complete; 1001 must be rejected.
  for (const [count, expectedLength, expectError] of [[999,999,false],[1000,1000,false],[1001,0,true]]) {
    const boundaryWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    const boundaryRequests=[];
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:boundaryWindow,AbortController,setTimeout,clearTimeout,
      fetch:async url=>{
        const u=new URL(url),offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));
        boundaryRequests.push({offset,limit});
        return {ok:true,json:async()=>Array.from({length:Math.max(0,Math.min(limit,count-offset))},(_,i)=>({id:String(offset+i)}))};
      }
    });
    const boundary=await boundaryWindow.MSB_CATALOG.products();
    assert.equal(boundary.rows.length,expectedLength,'catalog boundary '+count);
    assert.equal(Boolean(boundary.error),expectError,'catalog boundary error '+count);
    if(count>=1000)assert.deepEqual(boundaryRequests.at(-1),{offset:1000,limit:1});
  }
  console.log('PASS catalog handles exact 1000-item limit and rejects overflow');


  // Overlapping pages indicate unstable pagination; never show duplicate cards or partial results.
  const overlapWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:overlapWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>{
      const offset=Number(new URL(url).searchParams.get('offset'));
      const ids=offset===0?Array.from({length:100},(_,i)=>'p-'+i):['p-99','p-100'];
      return {ok:true,json:async()=>ids.map(id=>({id}))};
    }
  });
  const overlap=await overlapWindow.MSB_CATALOG.products();
  assert.equal(overlap.rows.length,0);
  assert.match(overlap.error,/repeated/);
  console.log('PASS catalog rejects overlapping product pages');

  const malformedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:malformedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,json:async()=>[{title_ar:'missing id'}]})
  });
  const malformed=await malformedWindow.MSB_CATALOG.products();
  assert.equal(malformed.rows.length,0);
  assert.match(malformed.error,/Invalid/);
  console.log('PASS catalog rejects malformed product identifiers');

  const bad = {MSB_SUPABASE:{url:'http://example.supabase.co',publishableKey:'service_role_secret'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{window:bad,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('must not fetch')}});
  assert.equal(bad.MSB_CATALOG.configured,false);
  const disabled = await bad.MSB_CATALOG.products();
  assert.equal(disabled.configured,false);
  console.log('PASS catalog rejects invalid public configuration');
}
run().catch(e=>{console.error(e);process.exitCode=1});
