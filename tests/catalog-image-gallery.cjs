const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync('catalog.js','utf8');
const image=(position,url=`https://images.example.org/dress-${position}.jpg`)=>({image_url:url,position});
async function check(images,expectedError){
 let requests=0;
 const window={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
 const sandbox={window,URL,AbortController,setTimeout,clearTimeout,fetch:async()=>{requests++;return {ok:true,json:async()=>[{
  id:'dress',title_ar:'فستان',title_en:'Dress',price_usd:25,stock:3,product_images:images
 }]}}};
 vm.runInNewContext(code,sandbox,{filename:'catalog.js'});
 const result=await window.MSB_CATALOG.products();
 assert.equal(result.error,expectedError);
 assert.equal(requests,1,'malformed image metadata must not trigger retries');
 if(expectedError)assert.equal(result.rows.length,0,'reject the entire unsafe catalog page');
 else assert.equal(result.rows.length,1);
}
(async()=>{
 await check([image(0),image(1)],null);
 await check([],null);
 await check(Array.from({length:30},(_,i)=>image(i)),null);
 await check([image(0),image(0)],'Duplicate product image position');
 // Canonical numeric strings are accepted, but non-canonical strings such as '01' are rejected before duplicate checking.
 await check([image(1),image('1','https://images.example.org/other.jpg')],'Duplicate product image position');
 await check([image(1),image('01')],'Invalid product image URL or position');
 await check(Array.from({length:31},(_,i)=>image(i)),'Invalid product images');
 await check([image(0),image(1,'https://images.example.org/another.jpg')],null);
 await check([image(0),image(1,'https://images.example.org/dress-0.jpg')],'Duplicate product image URL');
 console.log('PASS catalog image position uniqueness and bounded gallery metadata');
})().catch(e=>{console.error(e);process.exitCode=1});
