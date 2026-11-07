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
      '127.0.0.1','127.1','printer','intranet','printer.test','server.invalid','shop.example','10.2.3.4','172.16.0.1','192.168.1.10',
      '169.254.1.1','100.64.0.1','0.0.0.0','224.0.0.1',
      '[::1]','[fe80::1]'].map(host=>[{image_url:'https://'+host+'/a.jpg',position:0}]),
  [{image_url:'https://example.com/a b.jpg',position:0}],
  [{image_url:'https://example.com/a\\\\b.jpg',position:0}],
  [{image_url:'https://example.com/a\u00a0b.jpg',position:0}],
  ...['\u034f','\u061c','\u180e','\u200b','\u200e','\u202e','\u2060','\ufeff'].map(mark=>[{image_url:'https://example.com/a'+mark+'b.jpg',position:0}]),
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
