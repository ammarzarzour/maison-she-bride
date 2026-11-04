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
assert.equal(rows().length,4,'Cancelled delete must keep data');
window.confirm=()=>true;
$('requestRows').children[0].children[3].children[0].children[1].click();
assert.equal(rows().length,3,'Delete must remove only matching fictional request');
assert.equal($('totalCount').textContent,2);
const updated=rows();
updated.push({id:'DEMO-DDDDDD',service:3,state:'draft'});
memory.set('sanad_preview_requests_v1',JSON.stringify(updated));
handlers.storage({key:'sanad_preview_requests_v1'});
assert.equal($('totalCount').textContent,3);
assert.equal($('draftCount').textContent,1);
assert.match($('footer').textContent,/prototype/);
console.log('PASS Sanad bilingual browser-only demo dashboard, filters, status updates, deletion and storage sync');
