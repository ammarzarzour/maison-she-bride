const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('admin.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script?.includes('adminSessionVersion'), 'Missing session version guard');
assert.ok(script?.includes('adminLoadVersion'), 'Missing out-of-order refresh guard');

class Element{
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.value='';this.textContent='';this.className='';this.handlers={};
  const classes=new Set();
  this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)};
 }
 append(...v){this.children.push(...v)}
 replaceChildren(...v){this.children=v}
 setAttribute(k,v){this[k]=v}
 addEventListener(k,v){this.handlers[k]=v}
}
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)}
const document={documentElement:{lang:'ar',dir:'rtl'},getElementById:node,createElement:tag=>new Element(tag),querySelectorAll:()=>[]};
const requests=[];
function deferred(){
 let resolve;
 const promise=new Promise(r=>{resolve=r});
 return {promise,resolve};
}
function fetch(url,opts){
 const pending=deferred();
 requests.push({url,opts,pending});
 return pending.promise;
}
const localStorage={getItem:()=>null,setItem(){}};
const context=vm.createContext({document,fetch,localStorage,navigator:{language:'ar-SY'},URL});
vm.runInContext(script,context,{filename:'admin.html#session'});
function execute(expr){return vm.runInContext(expr,context)}
function success(request,d){
 request.pending.resolve({ok:true,status:200,json:async()=>d});
}
function denied(request,status=403){
 request.pending.resolve({ok:false,status,json:async()=>({error:'Not authorized'})});
}
function dataset(count){
 return {
  counts:{stores:count,pendingStores:0,products:0,draftProducts:0,orders:0},
  stores:[{id:'example-store',name:'Sample '+count,status:'approved',created_at:'2026-01-01T00:00:00Z'}],
  products:[],orders:[]
 };
}
async function run(){
 // A response delivered after sign-out may never restore protected records.
 execute("token='first-test-token';adminSessionVersion++");
 const oldLoad=execute('load()');
 assert.equal(requests.length,1);
 node('logout').onclick();
 assert.equal(execute('token'),'');
 success(requests[0],dataset(5));
 await oldLoad;
 assert.equal(execute('lastDashboard'),null);
 assert.equal(node('storesRows').children.length,0);
 assert.equal(node('storesCount').textContent,'0');
 assert.equal(node('loginPanel').classList.contains('hidden'),false);
 assert.equal(requests.length,1);

 // A late 403 from one account must not revoke a subsequent account session.
 execute("token='stale-token';adminSessionVersion++");
 const staleLoad=execute('load()');
 node('logout').onclick();
 execute("token='new-token';adminSessionVersion++");
 const currentLoad=execute('load()');
 assert.equal(requests[1].opts.headers.Authorization,'Bearer stale-token');
 assert.equal(requests[2].opts.headers.Authorization,'Bearer new-token');
 denied(requests[1]);
 await staleLoad;
 assert.equal(execute('token'),'new-token','old 403 must not log out current account');
 success(requests[2],dataset(7));
 await currentLoad;
 assert.equal(node('storesCount').textContent,7);

 // When refreshes overlap, the newest response wins regardless of arrival order.
 const slow=execute('load()');
 const fast=execute('load()');
 success(requests[4],dataset(9));
 await fast;
 success(requests[3],dataset(3));
 await slow;
 assert.equal(node('storesCount').textContent,9,'late old refresh must not overwrite newer data');
 assert.equal(execute('lastDashboard.counts.stores'),9);

 // A write sent before logout cannot be recalled, but its late response must not redraw the UI.
 const before=requests.length;
 const action=execute("act('stores','example-store','approve')");
 assert.equal(requests.length,before+1);
 assert.equal(requests[before].opts.method,'POST');
 node('logout').onclick();
 success(requests[before],{ok:true});
 await action;
 assert.equal(requests.length,before+1,'expired action must not trigger a follow-on refresh');
 assert.equal(node('storesRows').children.length,0);
 assert.equal(node('storesCount').textContent,'0');

 // Expired current sessions should clear data and show a bilingual sign-in message.
 execute("token='expired-token';adminSessionVersion++");
 const expired=execute('load()');
 denied(requests.at(-1),401);
 await expired;
 assert.equal(execute('token'),'');
 assert.equal(execute('lastDashboard'),null);
 assert.match(node('msg').textContent,/انتهت صلاحية جلسة الإدارة/);

 // Two overlapping sign-ins: only the latest login attempt may establish the session.
 const firstAuth=execute('auth()'),firstIndex=requests.length-1;
 const secondAuth=execute('auth()'),secondIndex=requests.length-1;
 assert.ok(requests[firstIndex].url.includes('/auth/v1/token?'));
 assert.ok(requests[secondIndex].url.includes('/auth/v1/token?'));
 success(requests[secondIndex],{access_token:'second-login-token'});
 await Promise.resolve();
 await Promise.resolve();
 const secondLoad=requests.at(-1);
 assert.ok(secondLoad.url.includes('/functions/v1/admin-console'));
 assert.equal(secondLoad.opts.headers.Authorization,'Bearer second-login-token');
 success(secondLoad,dataset(12));
 await secondAuth;
 success(requests[firstIndex],{access_token:'first-login-token'});
 await firstAuth;
 assert.equal(execute('token'),'second-login-token');
 assert.equal(node('storesCount').textContent,12);

 console.log('PASS admin stale-load isolation, overlapping refreshes, old 403, late write response and login races');
}
run().catch(e=>{console.error(e);process.exitCode=1});
