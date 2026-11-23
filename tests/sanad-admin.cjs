const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const script=fs.readFileSync('sanad-admin-demo.js','utf8');
const html=fs.readFileSync('sanad-admin-preview.html','utf8');
const main=fs.readFileSync('sanad-preview.html','utf8');
assert.match(html,/id="requestRows"/);
assert.match(html,/id="notice"/);
assert.match(main,/href="\.\/sanad-admin-preview\.html"/);
assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon\s*\(/,'Demo dashboard may not send data over network');
assert.doesNotMatch(script,/.innerHTML\b/,'Untrusted local data must use safe DOM text nodes');
const memory=new Map([['sanad_preview_requests_v1',JSON.stringify([
  {id:'DEMO-AAAAAA',service:0,state:'draft'},
  {id:'DEMO-BBBBBB',service:1,state:'review'},
  {id:'DEMO-CCCCCC',service:2,state:'done'},
  {id:'INVALID',service:9,state:'draft'}
])]]);
const handlers={},nodes=new Map();
class Node {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.className='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;if(this.tagName==='select')this.value=children[0]?.value??'';}
  addEventListener(type,fn){this.listeners[type]=fn;}
  click(){assert.ok(this.listeners.click,'Expected click handler');this.listeners.click();}
}
const getElementById=id=>{
  if(!nodes.has(id))nodes.set(id,new Node(['language','statusFilter'].includes(id)?'select':'div'));
  return nodes.get(id);
};
const document={documentElement:{lang:'ar',dir:'rtl'},getElementById,createElement:tag=>new Node(tag)};
const window={confirm:()=>true,addEventListener:(type,fn)=>{handlers[type]=fn;}};
const localStorage={getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,String(val))};
const $=getElementById;
const rows=()=>JSON.parse(memory.get('sanad_preview_requests_v1'));
vm.runInNewContext(script,{document,window,localStorage,navigator:{language:'ar-SY'},JSON});
assert.equal($('totalCount').textContent,3);
assert.equal($('draftCount').textContent,1);
assert.equal($('reviewCount').textContent,1);
assert.equal($('doneCount').textContent,1);
assert.equal($('requestRows').children.length,3);
assert.equal(document.documentElement.dir,'rtl');
assert.match($('notice').textContent,/المتصفح/);
$('requestRows').children[0].children[3].children[0].children[0].click();
assert.equal(rows()[0].state,'review');
assert.equal($('reviewCount').textContent,2);
$('statusFilter').value='review';$('statusFilter').listeners.change();
assert.equal($('requestRows').children.length,2);
$('searchRequests').value='DEMO-BBBBBB';$('searchRequests').listeners.input();
assert.equal($('requestRows').children.length,1);
$('searchRequests').value='';$('searchRequests').listeners.input();
$('language').listeners.change({target:{value:'en'}});
assert.equal(document.documentElement.dir,'ltr');
assert.match($('notice').textContent,/fictional dashboard/);
assert.equal(memory.get('sanad_lang'),'en');
window.confirm=()=>false;
$('requestRows').children[0].children[3].children[0].children[1].click();
assert.equal(rows().length,3,'Cancelled delete must keep data');
window.confirm=()=>true;
$('requestRows').children[0].children[3].children[0].children[1].click();
assert.equal(rows().length,2,'Delete must remove only matching fictional request');
assert.equal($('totalCount').textContent,2);
const updated=rows();
updated.push({id:'DEMO-DDDDDD',service:3,state:'draft'});
memory.set('sanad_preview_requests_v1',JSON.stringify(updated));
handlers.storage({key:'sanad_preview_requests_v1'});
assert.equal($('totalCount').textContent,3);
assert.equal($('draftCount').textContent,1);
assert.match($('footer').textContent,/prototype/);
console.log('PASS Sanad bilingual browser-only demo dashboard, filters, status updates, deletion and storage sync');

memory.set('sanad_preview_requests_v1',JSON.stringify([
 {id:'DEMO-UNIQUE',service:0,state:'draft'},
 {id:'DEMO-UNIQUE',service:1,state:'review'},
 {id:'DEMO-SECOND',service:2,state:'draft'}
]));
$('statusFilter').value='all';$('searchRequests').value='';
handlers.storage({key:'sanad_preview_requests_v1'});
assert.equal($('totalCount').textContent,2,'duplicate IDs must not appear twice');
$('requestRows').children[0].children[3].children[0].children[0].click();
assert.equal(rows().length,2,'updating a reference must persist unique records only');
assert.equal(rows()[0].state,'review');
assert.equal(rows()[1].state,'draft','other reference unchanged');

memory.clear();
handlers.storage({key:null,storageArea:localStorage});
assert.equal($('totalCount').textContent,0,'clear from another tab removes stale demo rows');
assert.equal(document.documentElement.dir,'rtl','cleared language returns to browser language');
memory.set('sanad_preview_requests_v1',JSON.stringify([{id:'DEMO-FOREIGN',service:0,state:'draft'}]));
handlers.storage({key:'sanad_preview_requests_v1',storageArea:{}});
assert.equal($('totalCount').textContent,0,'foreign storage event ignored');
handlers.storage({key:'sanad_preview_requests_v1',storageArea:localStorage});
assert.equal($('totalCount').textContent,1,'same storage updates visible rows');

$('requestRows').children[0].children[3].children[0].children[0].click();
assert.match($('message').textContent,/محلياً/);
$('language').listeners.change({target:{value:'en'}});
assert.match($('message').textContent,/Stage changed locally/,'visible feedback follows selected language');
$('language').listeners.change({target:{value:'ar'}});
assert.match($('message').textContent,/محلياً/,'feedback switches back without losing result');

// Prevent browser-only fictional registers from overloading storage parsing.

$('statusFilter').value='all';
$('searchRequests').value='';
const largeRegister = JSON.stringify([{id:'DEMO-TOOBIG',service:0,state:'draft',padding:'x'.repeat(17000)}]);
memory.set('sanad_preview_requests_v1',largeRegister);
handlers.storage({key:'sanad_preview_requests_v1',storageArea:localStorage});
assert.equal($('totalCount').textContent,0,'dashboard must not load oversized browser-only registers');
assert.equal(memory.get('sanad_preview_requests_v1'),largeRegister,'reading oversized records must not overwrite storage');
const acceptedRegister = [{id:'DEMO-ATLIMIT',service:1,state:'review',padding:''}];
acceptedRegister[0].padding='a'.repeat(16384-JSON.stringify(acceptedRegister).length);
memory.set('sanad_preview_requests_v1',JSON.stringify(acceptedRegister));
handlers.storage({key:'sanad_preview_requests_v1',storageArea:localStorage});
assert.equal($('totalCount').textContent,1,'dashboard accepts a register exactly at the storage limit');
assert.equal($('reviewCount').textContent,1);


// The browser-only dashboard must not apply stale buttons to newer fictional
// request snapshots. The originating window may not have received a storage event.
$('statusFilter').value='all';$('searchRequests').value='';
const raceKey='sanad_preview_requests_v1';
const draft={id:'DEMO-RACEST',service:1,state:'draft'};
memory.set(raceKey,JSON.stringify([draft]));
handlers.storage({key:raceKey,storageArea:localStorage});
const staleAdvance=$('requestRows').children[0].children[3].children[0].children[0];
const newerReview={...draft,state:'review'};
memory.set(raceKey,JSON.stringify([newerReview]));
staleAdvance.click();
assert.equal(rows()[0].state,'review','stale next-stage button must not overwrite newer state');
assert.match($('message').textContent,/نافذة أخرى/,'conflict message is localised');
assert.equal($('reviewCount').textContent,1,'conflict refreshes visible status');
const staleDelete=$('requestRows').children[0].children[3].children[0].children[1];
const newerDone={...draft,state:'done'};
memory.set(raceKey,JSON.stringify([newerDone]));
staleDelete.click();
assert.equal(rows()[0].state,'done','stale deletion must not remove an updated row');
assert.equal(rows().length,1);
assert.equal($('doneCount').textContent,1);
$('language').listeners.change({target:{value:'en'}});
assert.match($('message').textContent,/another tab/,'conflict follows language switching');

// Recheck the snapshot after confirmation, because the underlying state may
// change while a browser confirmation dialog is open.
memory.set(raceKey,JSON.stringify([draft]));
handlers.storage({key:raceKey,storageArea:localStorage});
let confirmationCount=0;
window.confirm=()=>{
 confirmationCount++;
 memory.set(raceKey,JSON.stringify([newerReview]));
 return true;
};
$('requestRows').children[0].children[3].children[0].children[1].click();
assert.equal(confirmationCount,1);
assert.equal(rows().length,1,'confirmation races must preserve newer records');
assert.equal(rows()[0].state,'review');
assert.match($('message').textContent,/another tab/);
window.confirm=()=>true;
$('requestRows').children[0].children[3].children[0].children[1].click();
assert.equal(rows().length,0,'fresh confirmed deletion still works');
assert.equal($('totalCount').textContent,0);
