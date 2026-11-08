const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = fs.readFileSync('catalog.js', 'utf8');

async function load(image_url) {
  const window = {MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(script, {
    window, URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ok:true,json:async()=>[{
      id:'dress-1',title_ar:'فستان',title_en:'Dress',price_usd:10,stock:2,
      product_images:[{image_url,position:0}]
    }]})
  });
  return window.MSB_CATALOG.products();
}

(async()=>{
  for(const url of [
    'https://images.example.com/dress.jpg',
    'https://images.example.com/path%20with%20spaces.jpg'
  ]) {
    const result=await load(url);
    assert.equal(result.error,null,'valid image URL: '+url);
    assert.equal(result.rows.length,1);
  }
  for(const url of [
    ' https://images.example.com/dress.jpg',
    'https://images.example.com/dress.jpg ',
    'https://images.example.com/\tdress.jpg',
    'https://images.example.com/\ndress.jpg',
    'https://images.example.com/dress.jpg\r',
    'https://images.example.com/'+ 'a'.repeat(2100),
    'https://images.example.com/dress.jpg\u007f'
  ]) {
    const result=await load(url);
    assert.equal(result.rows.length,0,'reject malformed image URL');
    assert.match(result.error,/Invalid product image/);
  }
  console.log('PASS catalog rejects image URL controls and surrounding whitespace');
})().catch(error=>{console.error(error);process.exitCode=1});
