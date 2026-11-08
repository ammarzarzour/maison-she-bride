const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('catalog.js','utf8');
const encode=value=>Buffer.from(JSON.stringify({role:value})).toString('base64url');
const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+encode(role)+'.signature';
async function check(config,expected){
 let calls=0;
 const window={MSB_SUPABASE:config};
 vm.runInNewContext(source,{window,atob:value=>Buffer.from(value,'base64').toString('binary'),URL,AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return {ok:true,json:async()=>[]};}});
 assert.equal(window.MSB_CATALOG.configured,expected,JSON.stringify(config));
 await window.MSB_CATALOG.products();
 await window.MSB_CATALOG.categories();
 assert.equal(calls,expected?2:0,'invalid credentials must never trigger a request');
}
(async()=>{
 const url='https://example.supabase.co';
 for(const config of [
  {},{url,publishableKey:'sb_secret_sensitive'},
  {url,publishableKey:jwt('service_role')},
  {url,publishableKey:jwt('authenticated')},
  {url,publishableKey:jwt('supabase_admin')},
  {url,publishableKey:jwt('')},
  {url,publishableKey:'eyJhbGciOiJIUzI1NiJ9.not-json.signature'},
  {url,publishableKey:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from('{"role":"anon"').toString('base64url')+'.signature'},
  {url,publishableKey:'sb_publishable_test='},
  {url,publishableKey:'sb_publishable_test/extra'},
  {url,publishableKey:'sb_secret_test'},
  {url,publishableKey:'sb_publishable_'+ 'x'.repeat(4096)},
  {url,publishableKey:jwt('anon')+'x'.repeat(4096)},
  {url,publishableKey:'sb_publishable_'},
  {url,publishableKey:'sb_publishable_test with spaces'},
  {url,publishableKey:'sb_publishable_test\n'},
  {url:'http://example.supabase.co',publishableKey:'sb_publishable_test'},
  {url:'https://example.supabase.co.evil.org',publishableKey:'sb_publishable_test'},
  {url:'https://user@example.supabase.co',publishableKey:'sb_publishable_test'},
  {url:'https://example.supabase.co/path',publishableKey:'sb_publishable_test'},
  {url:'https://example.supabase.co:443',publishableKey:'sb_publishable_test'},
  {url:'https://example.supabase.co?x=1',publishableKey:'sb_publishable_test'}
 ])await check(config,false);
 await check({url,publishableKey:'sb_publishable_test'},true);
 await check({url,publishableKey:jwt('anon')},true);
 console.log('PASS catalog blocks secret and non-public credentials without network requests');
})().catch(error=>{console.error(error);process.exitCode=1;});
