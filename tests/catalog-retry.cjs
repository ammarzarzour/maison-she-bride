const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('catalog.js','utf8');

async function scenario(steps,expectedAttempts,expectedError=false){
 const requests=[],delays=[];
 const window={MSB_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}};
 const validRow={id:'test-1',slug:'bridal',name_ar:'فساتين',name_en:'Dresses'};
 const fetch=async (url,opts)=>{
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.apikey,window.MSB_SUPABASE.publishableKey);
  assert.ok(url.includes('/rest/v1/categories?'));
  requests.push(url);
  const step=steps[Math.min(requests.length-1,steps.length-1)];
  if(step==='network')throw new TypeError('Network temporarily unavailable');
  if(step==='timeout'){const e=new Error('Request aborted');e.name='AbortError';throw e}
  if(step==='json-typeerror')return {ok:true,json:async()=>{throw new TypeError('Malformed response body')}};
  if(step==='invalid-json')return {ok:true,json:async()=>{throw new SyntaxError('Bad JSON')}};
  if(step==='not-array')return {ok:true,json:async()=>({rows:[]})};
  if(typeof step==='string'&&step.startsWith('success-'))return {ok:true,status:Number(step.slice(8)),json:async()=>[validRow]};
  if(typeof step==='number')return {ok:false,status:step};
  return {ok:true,json:async()=>[validRow]};
 };
 // Make backoff deterministic and fast; timers for AbortController still register but never fire.
 let nextTimer=0;
 const timers=new Map();
 const setTimeout=(callback,delay)=>{
  if(delay===200||delay===500){delays.push(delay);Promise.resolve().then(callback);return ++nextTimer;}
  const id=++nextTimer;timers.set(id,callback);return id;
 };
 const clearTimeout=id=>timers.delete(id);
 vm.runInNewContext(source,{window,fetch,AbortController,setTimeout,clearTimeout,URL});
 const result=await window.MSB_CATALOG.categories();
 assert.equal(requests.length,expectedAttempts,JSON.stringify(steps));
 assert.equal(Boolean(result.error),expectedError,JSON.stringify(steps));
 assert.equal(result.rows.length,expectedError?0:1,JSON.stringify(steps));
 assert.ok(requests.every(url=>url===requests[0]),'retries must request the same read-only page');
 assert.ok(requests.length<=3,'must not retry indefinitely');
 assert.deepEqual(delays,expectedAttempts===1?[]:expectedAttempts===2?[200]:[200,500]);
 return {result,requests};
}
(async()=>{
 await scenario(['ok'],1);
 // Other 2xx statuses can be incomplete or asynchronous: never treat them as a full catalog.
 for(const status of [201,202,204,205,206,207])await scenario(['success-'+status,'ok'],1,true);
 await scenario([503,'ok'],2);
 await scenario([429,502,'ok'],3);
 await scenario(['network','ok'],2);
 await scenario(['timeout','ok'],2);
 for(const status of [400,401,403,404,422])await scenario([status,'ok'],1,true);
 await scenario([503,503,503,'ok'],3,true);
 await scenario(['network','network','network','ok'],3,true);
 await scenario(['invalid-json','ok'],1,true);
 await scenario(['json-typeerror','ok'],1,true);
 await scenario(['not-array','ok'],1,true);
 console.log('PASS catalog retries bounded transient reads, refuses permanent errors and malformed data');
})().catch(e=>{console.error(e);process.exitCode=1});
