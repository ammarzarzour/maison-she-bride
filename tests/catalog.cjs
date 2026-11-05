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
      if (url.includes('/products?')) return {ok:true,json:async()=>[{id:'product-1',title_ar:'فستان',title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}]};
      if (url.includes('/categories?')) return {ok:true,json:async()=>[{id:'category-1',slug:'bridal',name_ar:'عرائس',name_en:'Bridal'}]};
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
      return {ok:true,json:async()=>Array.from({length:count},(_,i)=>({id:'p-'+(offset+i),title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))};
    }};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),pagedSandbox);
  const many=await pagedWindow.MSB_CATALOG.products();
  assert.equal(many.error,null);
  assert.equal(many.rows.length,103);
  assert.equal(pages.length,2);
  assert.equal(many.rows[102].id,'p-102');
  console.log('PASS catalog paginates more than 100 published products');

  // A server response exceeding the requested page size is unsafe for offset pagination.
  const oversizedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:oversizedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,json:async()=>Array.from({length:101},(_,i)=>({id:'oversized-'+i,title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))})
  });
  const oversized=await oversizedWindow.MSB_CATALOG.products();
  assert.equal(oversized.rows.length,0);
  assert.match(oversized.error,/exceeds requested limit/);
  console.log('PASS catalog rejects oversized pagination responses');

  // A failed subsequent page must not masquerade as a complete catalog.
  const failedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:failedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>Number(new URL(url).searchParams.get('offset'))===0
      ?{ok:true,json:async()=>Array.from({length:100},(_,i)=>({id:String(i),title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))}
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
        return {ok:true,json:async()=>Array.from({length:Math.max(0,Math.min(limit,count-offset))},(_,i)=>({id:String(offset+i),title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))};
      }
    });
    const boundary=await boundaryWindow.MSB_CATALOG.products();
    assert.equal(boundary.rows.length,expectedLength,'catalog boundary '+count);
    assert.equal(Boolean(boundary.error),expectError,'catalog boundary error '+count);
    if(count>=1000)assert.deepEqual(boundaryRequests.at(-1),{offset:1000,limit:1});
  }
  console.log('PASS catalog handles exact 1000-item limit and rejects overflow');
  // Even the overflow probe must obey its one-row limit.
  const probeWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:probeWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>{
      const offset=Number(new URL(url).searchParams.get('offset'));
      const count=offset===1000?2:100;
      return {ok:true,json:async()=>Array.from({length:count},(_,i)=>({id:'probe-'+(offset+i),title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))};
    }
  });
  const oversizedProbe=await probeWindow.MSB_CATALOG.products();
  assert.equal(oversizedProbe.rows.length,0);
  assert.match(oversizedProbe.error,/overflow probe exceeds/);
  console.log('PASS catalog rejects oversized overflow probe');



  // Overlapping pages indicate unstable pagination; never show duplicate cards or partial results.
  const overlapWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:overlapWindow,AbortController,setTimeout,clearTimeout,
    fetch:async url=>{
      const offset=Number(new URL(url).searchParams.get('offset'));
      const ids=offset===0?Array.from({length:100},(_,i)=>'p-'+i):['p-99','p-100'];
      return {ok:true,json:async()=>ids.map(id=>({id,title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}))};
    }
  });
  const overlap=await overlapWindow.MSB_CATALOG.products();
  assert.equal(overlap.rows.length,0);
  assert.match(overlap.error,/repeated/);
  console.log('PASS catalog rejects overlapping product pages');

  const malformedWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
    window:malformedWindow,AbortController,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,json:async()=>[{title_ar:'missing id',title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}]})
  });
  const malformed=await malformedWindow.MSB_CATALOG.products();
  assert.equal(malformed.rows.length,0);
  assert.match(malformed.error,/Invalid/);
  console.log('PASS catalog rejects malformed product identifiers');

  // Whitespace-only IDs are truthy but cannot safely identify a cart item.
  for (const id of ['', ' ', String.fromCharCode(9,10)]) {
    const blankWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:blankWindow,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id,title_ar:'فستان',title_en:'Dress',price_usd:10,stock:1}]})
    });
    const blank=await blankWindow.MSB_CATALOG.products();
    assert.equal(blank.rows.length,0,'blank identifier must not render');
    assert.match(blank.error,/Invalid or repeated product/);
  }
  console.log('PASS catalog rejects empty and whitespace-only product identifiers');

  // Reject missing or blank bilingual titles before the storefront renders.
  for(const [ar,en] of [[null,'Dress'],['','Dress'],['   ','Dress'],['فستان',null],['فستان',''],['فستان','   ']]) {
    const titleWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:titleWindow,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad-title',title_ar:ar,title_en:en,price_usd:10,stock:1}]})
    });
    const titleResult=await titleWindow.MSB_CATALOG.products();
    assert.equal(titleResult.rows.length,0);
    assert.match(titleResult.error,/bilingual product title/);
  }
  console.log('PASS catalog rejects blank or missing Arabic and English titles');

  // Extremely large finite USD amounts can overflow the storefront's SYP display rate.
  // Reject the entire response instead of showing an Infinity total or product price.
  for (const hugePrice of [1e308, '1e308']) {
    const hugeWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:hugeWindow,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'overflow-price',title_ar:'فستان',title_en:'Dress',price_usd:hugePrice,stock:1}]})
    });
    const result=await hugeWindow.MSB_CATALOG.products();
    assert.equal(result.rows.length,0);
    assert.match(result.error,/price or stock/);
  }
  console.log('PASS catalog rejects prices overflowing currency conversion');

  // Valid unit prices may still overflow when multiplied by inventory.
  for (const [price,stock,reject] of [[1e301,1000000,true],[1e301,1,false],[100,3,false]]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'subtotal-test',title_ar:'فستان',title_en:'Dress',price_usd:price,stock}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(Boolean(result.error),reject,'stock-wide converted total overflow');
    assert.equal(result.rows.length,reject?0:1);
  }
  console.log('PASS catalog rejects overflow of price times stock times display rate');


  // Live catalog must not silently render NaN prices or invalid stock values.
  for (const [price,stock] of [['not-a-price',1],[10,-2],[10,1.5]]) {
    const invalidWindow={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:invalidWindow,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad',title_ar:'فستان',title_en:'Dress',price_usd:price,stock}]})
    });
    const invalid=await invalidWindow.MSB_CATALOG.products();
    assert.equal(invalid.rows.length,0);
    assert.match(invalid.error,/price or stock/);
  }
  for (const price of [null, '', '   ', false]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad-price',title_ar:'فستان',title_en:'Dress',price_usd:price,stock:1}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(result.rows.length,0);
    assert.match(result.error,/price or stock/);
  }
  console.log('PASS catalog rejects null blank and boolean prices');

  for (const stock of [null, '', '   ', false, true]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad-stock',title_ar:'فستان',title_en:'Dress',price_usd:10,stock}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(result.rows.length,0);
    assert.match(result.error,/price or stock/);
  }
  console.log('PASS catalog rejects null blank and boolean stock');

  // JSON arrays/objects can coerce to numbers (e.g. [] -> 0 or [1] -> 1).
  // Reject these malformed payloads instead of displaying fabricated values.
  for (const [price, stock] of [
    [[],1], [[10],1], [{},1], [10,[]], [10,[1]], [10,{}]
  ]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad-json-type',title_ar:'فستان',title_en:'Dress',price_usd:price,stock}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(result.rows.length,0,'arrays and objects must never become numeric prices or stock');
    assert.match(result.error,/price or stock/);
  }
  console.log('PASS catalog rejects array/object prices and stock');

  // JSON numeric text must use ordinary decimal notation, never JavaScript's
  // permissive Number() coercions such as hexadecimal, exponents or signs.
  for (const [price, stock] of [
    ['0x10',1], ['1e3',1], ['+12',1], ['-0',1], [' 12',1], ['12 ',1], ['\t12',1],
    [10,'0x10'], [10,'1e2'], [10,'+2'], [10,'2.0'], [10,' 2'], [10,'2 '], [10,'\n2']
  ]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'bad-decimal',title_ar:'فستان',title_en:'Dress',price_usd:price,stock}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(result.rows.length,0,'non-decimal numeric text must be rejected');
    assert.match(result.error,/price or stock/);
  }
  for (const [price, stock] of [['12.50','2'],['0','1'],[12.5,2]]) {
    const w={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:w,AbortController,setTimeout,clearTimeout,
      fetch:async()=>({ok:true,json:async()=>[{id:'valid-decimal',title_ar:'فستان',title_en:'Dress',price_usd:price,stock}]})
    });
    const result=await w.MSB_CATALOG.products();
    assert.equal(result.error,null,'valid decimal values must remain supported');
    assert.equal(result.rows.length,1);
  }
  console.log('PASS catalog accepts decimal numeric strings and rejects JavaScript-only numeric formats');






  console.log('PASS catalog rejects invalid live prices and stock');

  // A legacy Supabase JWT may be used in the browser only if its role is anon.
  // Never permit a service_role JWT to be embedded in a public storefront.
  for (const [role, expected] of [['anon',true],['service_role',false],['authenticated',false]]) {
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const jwt=[encode({alg:'HS256',typ:'JWT'}),encode({role}), 'signature'].join('.');
    const legacy={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:jwt}};
    vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{
      window:legacy,atob:value=>Buffer.from(value,'base64').toString('utf8'),
      AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('unexpected fetch')}
    });
    assert.equal(legacy.MSB_CATALOG.configured,expected,'JWT role '+role);
  }
  console.log('PASS legacy JWT configuration permits anon only');

  const bad = {MSB_SUPABASE:{url:'http://example.supabase.co',publishableKey:'service_role_secret'}};
  vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),{window:bad,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('must not fetch')}});
  assert.equal(bad.MSB_CATALOG.configured,false);
  const disabled = await bad.MSB_CATALOG.products();
  assert.equal(disabled.configured,false);
  console.log('PASS catalog rejects invalid public configuration');
}
run().catch(e=>{console.error(e);process.exitCode=1});
