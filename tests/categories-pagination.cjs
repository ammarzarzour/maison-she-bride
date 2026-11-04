const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('catalog.js','utf8');
async function scenario(count, mutate) {
 const requests=[];
 const window={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
 vm.runInNewContext(source,{window,AbortController,setTimeout,clearTimeout,
  fetch:async url=>{
   const params=new URL(url).searchParams;
   const offset=Number(params.get('offset')),limit=Number(params.get('limit'));
   requests.push({offset,limit,url});
   let rows=Array.from({length:Math.max(0,Math.min(limit,count-offset))},(_,i)=>({id:'cat-'+(offset+i),slug:'slug-'+(offset+i)}));
   if(mutate)rows=mutate(rows,offset,limit);
   return {ok:true,json:async()=>rows};
  }
 });
 return {result:await window.MSB_CATALOG.categories(),requests};
}
(async()=>{
 for(const count of [0,1,99,100,101,999,1000,1001]){
  const {result,requests}=await scenario(count);
  assert.equal(result.rows.length,count<=1000?count:0,'category count '+count);
  assert.equal(Boolean(result.error),count>1000,'category overflow '+count);
  assert.ok(requests.every(r=>r.url.includes('order=id.asc')),'stable category ordering');
  if(count===1000||count===1001)assert.deepEqual([requests.at(-1).offset,requests.at(-1).limit],[1000,1]);
 }
 for(const [name,mutate,expected] of [
  ['duplicate', (rows,offset)=>offset===100?[{...rows[0],id:'cat-0'},...rows.slice(1)]:rows,/repeated category/],
  ['duplicate slug across pages', (rows,offset)=>offset===100?[{...rows[0],slug:'slug-0'},...rows.slice(1)]:rows,/repeated category/],
  ['duplicate slug within page', rows=>rows.map((r,i)=>i===1?{...r,slug:'slug-0'}:r),/repeated category/],
  ['blank id', rows=>rows.map((r,i)=>i===0?{...r,id:'  '}:r),/Invalid or repeated/],
  ['blank slug',rows=>rows.map((r,i)=>i===0?{...r,slug:' '}:r),/Invalid or repeated/],
  ['missing id',rows=>rows.map((r,i)=>i===0?{slug:r.slug}:r),/Invalid or repeated/],
  ['oversized',rows=>rows.concat({id:'extra',slug:'extra'}),/exceeds requested limit/]
 ]){
  const {result}=await scenario(name==='duplicate'||name==='duplicate slug across pages'?101:name==='oversized'?100:2,mutate);
  assert.equal(result.rows.length,0,name);
  assert.match(result.error,expected,name);
 }
 const {result:partial}=await scenario(101,(rows,offset)=>offset===100?null:rows);
 assert.equal(partial.rows.length,0);
 assert.ok(partial.error);
 console.log('PASS categories pagination boundaries, stable ordering, malformed data and incomplete responses');
})().catch(err=>{console.error(err);process.exitCode=1});
