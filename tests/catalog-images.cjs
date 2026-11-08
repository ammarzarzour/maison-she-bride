const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('catalog.js','utf8');
const valid={
 id:'product-1',store_id:'store-1',category_id:'cat-1',title_ar:'فستان',title_en:'Dress',
 price_usd:20,stock:2,product_images:[{image_url:'https://example.com/dress.jpg',position:0}]
};
async function run(images, expectedError) {
 const urls=[];
 const window={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
 const context=vm.createContext({window,URL,AbortController,setTimeout,clearTimeout,fetch:async url=>{
  urls.push(String(url));
  return {ok:true,json:async()=>[{...valid,product_images:images}]};
 }});
 vm.runInContext(script,context);
 const result=await window.MSB_CATALOG.products();
 assert.equal(result.configured,true);
 assert.equal(Boolean(result.error),expectedError,JSON.stringify(images));
 assert.equal(result.rows.length,expectedError?0:1);
 assert.equal(urls.length,1,'no unnecessary requests');
}
(async()=>{
 await run(valid.product_images,false);
 // Nested image records may arrive out of order from Supabase; verify the
 // adapter sorts by position without changing the original API response.
 {
  const images=[{image_url:'https://example.com/third.jpg',position:3},{image_url:'https://example.com/first.jpg',position:0},{image_url:'https://example.com/second.jpg',position:1}];
  const window={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  const sourceRow={...valid,product_images:images};
  const context=vm.createContext({window,URL,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>[sourceRow]})});
  vm.runInContext(script,context);
  const result=await window.MSB_CATALOG.products();
  assert.equal(result.error,null);
  assert.deepEqual(Array.from(result.rows[0].product_images,img=>img.position),[0,1,3]);
  assert.deepEqual(images.map(img=>img.position),[3,0,1],'API source array is not reordered');
  assert.equal(sourceRow.product_images,images,'original API row retains its image array');
  assert.notEqual(result.rows[0],sourceRow,'display sorting must not mutate the API row');
 }
 await run([{image_url:'https://example.com/dress.jpg',position:'2'}],false);
 await run([{image_url:'https://example.com/dress.jpg',position:0}],false);
 await run([],false);
 await run(null,false);
 for(const invalid of [
  'not-an-array',[null],[{}],[{image_url:'javascript:alert(1)',position:0}],
  [{image_url:'http://example.com/dress.jpg',position:0}],
  [{image_url:'data:image/png;base64,AA==',position:0}],
  [{image_url:'https://user:pass@example.com/a.jpg',position:0}],
  [{image_url:'https://',position:0}],
  // Reject browser requests to private or local networks, including normalized IPv4.
  ...['localhost','shop.localhost','printer.local','server.internal',
      '127.0.0.1','127.1','localhost.localdomain','app.localdomain','router.home','nas.lan','host.arpa','hidden.onion','printer','intranet','printer.test','server.invalid','shop.example','resolver.alt','service.sub.alt','10.2.3.4','172.16.0.1','192.168.1.10',
      '169.254.1.1','100.64.0.1','0.0.0.0','224.0.0.1',
      '192.0.2.1','198.51.100.12','203.0.113.8',
      '192.88.99.1','192.175.48.1',
      // Additional special-use IPv4 ranges and noncanonical browser URL spellings.
      '192.0.0.9','198.18.0.1','198.19.255.254','255.255.255.255',
      '0x7f000001','0177.0.0.1','2130706433','127.0.0.1.',
      '[::1]','[fe80::1]'].map(host=>[{image_url:'https://'+host+'/a.jpg',position:0}]),
  [{image_url:'https://example.com/a b.jpg',position:0}],
  [{image_url:'https://example.com/a\\\\b.jpg',position:0}],
  [{image_url:'https://example.com/a\u00a0b.jpg',position:0}],
  ...['\u034f','\u061c','\u180e','\u200b','\u200e','\u202e','\u2060','\ufeff'].map(mark=>[{image_url:'https://example.com/a'+mark+'b.jpg',position:0}]),
  [{image_url:'https://example.com/a.jpg',position:0},{image_url:'https://example.com/a.jpg',position:1}],
  // URL parsing normalizes hostname case, default HTTPS port, and ignores fragments for image identity.
  [{image_url:'https://EXAMPLE.com/a.jpg#one',position:0},{image_url:'https://example.com/a.jpg#two',position:1}],
  [{image_url:'https://example.com:443/a.jpg',position:0},{image_url:'https://example.com/a.jpg',position:1}],
  [{image_url:'https://example.com/a.jpg',position:-1}],
  [{image_url:'https://example.com/a.jpg',position:'oops'}],
  [{image_url:'https://example.com/a.jpg',position:''}],
  [{image_url:'https://example.com/a.jpg',position:'   '}],
  [{image_url:'https://example.com/a.jpg',position:false}],
  [{image_url:'https://example.com/a.jpg',position:[]}],
  [{image_url:'https://example.com/a.jpg',position:[1]}],
  [{image_url:'https://example.com/a.jpg',position:{}}],
  ...['1e2','+1','1.0',' 1','1 ','0x10','-0','00','01','0002','1e309','9007199254740992'].map(position=>[{image_url:'https://example.com/a.jpg',position}])
 ])await run(invalid,true);
 console.log('PASS HTTPS image URL validation and malformed image metadata cases');
})().catch(err=>{console.error(err);process.exitCode=1});
