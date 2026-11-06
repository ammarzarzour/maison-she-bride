const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const script = fs.readFileSync('sanad-demo.js','utf8');
const html = fs.readFileSync('sanad-preview.html','utf8');
assert.match(html, /id="demoForm"/, 'demo form should appear in the page');
assert.match(html, /id="demoDisclaimer"/, 'the local simulation must be identified');
assert.match(html, /sanad-demo\.js/, 'page must load the demo controller');
assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(/, 'simulation must not send data over the network');

const state = new Map();
const elements = new Map();
class Element {
  constructor(tagName='div'){
    this.tagName=tagName;
    this.children=[];
    this.listeners={};
    this.value='';
    this.textContent='';
    this.className='';
    this.type='';
  }
  replaceChildren(...children) {
    this.children=children;
    if(this.tagName==='select') this.value=children[0]?.value??'';
  }
  append(...children) {
    this.children.push(...children);
    if(this.tagName==='select'&&this.children.length===children.length) this.value=this.children[0].value;
  }
  addEventListener(event,fn){this.listeners[event]=fn;}
  click(){assert.equal(typeof this.listeners.click,'function');this.listeners.click();}
}
const tags = {demoService:'select',demoFilter:'select'};
function getElementById(id){
  if(!elements.has(id))elements.set(id,new Element(tags[id]||'div'));
  return elements.get(id);
}
const document = {
  documentElement:{lang:'ar',dir:'rtl'},
  getElementById,
  createElement:tag=>new Element(tag),
};
const localStorage = {
  getItem(key){return state.get(key)||null;},
  setItem(key,value){state.set(key,String(value));}
};
const window = {confirm:()=>true};
vm.runInNewContext(script,{document,localStorage,window,Date,Math});
const $=getElementById;
const rows=()=>JSON.parse(state.get('sanad_preview_requests_v1')||'[]');
function submit(service) {
  $('demoService').value=String(service);
  $('demoForm').listeners.submit({preventDefault(){}});
}
assert.match($('demoTitle').textContent,/محاكاة/);
assert.equal($('demoService').children.length,4);
submit(1);
assert.equal(rows().length,1);
assert.equal(rows()[0].service,1);
assert.equal(rows()[0].state,'draft');
assert.match(rows()[0].id,/^DEMO-[A-Z0-9]{6,16}$/);
assert.match($('demoMessage').textContent,/لم يُرسل/);
submit(3);
assert.equal(rows().length,2);
assert.notEqual(rows()[0].id,rows()[1].id,'new demo references must be distinct');
assert.equal($('demoList').children.length,2);

$('demoFilter').value='review';
$('demoFilter').listeners.change();
assert.equal($('demoList').children.length,1);
assert.equal($('demoList').children[0].className,'empty-demo');
$('demoFilter').value='all';
$('demoFilter').listeners.change();
const first=$('demoList').children[0];
first.children[2].children[0].click();
assert.equal(rows()[0].state,'review');
$('demoList').children[0].children[2].children[0].click();
assert.equal(rows()[0].state,'done');
assert.equal($('demoList').children[0].children[2].children.length,1);

document.documentElement.lang='en';
$('language').listeners.change();
assert.match($('demoTitle').textContent,/local simulation/);
assert.match($('demoDisclaimer').textContent,/Nothing goes to Sanad/);
$('demoFilter').value='done';
$('demoFilter').listeners.change();
assert.equal($('demoList').children.length,1);
assert.match($('demoList').children[0].children[1].textContent,/Simulated completion/);
$('demoList').children[0].children[2].children[0].click();
assert.equal(rows().length,1);
$('demoClear').click();
assert.equal(rows().length,0);
assert.match($('demoMessage').textContent,/cleared/);

// A blocked localStorage write must not be reported as a saved demo request.
// The page remains usable in memory, but the warning must survive re-rendering.
const blockedElements = new Map();
const blockedGet = id => {
  if (!blockedElements.has(id)) blockedElements.set(id,new Element(tags[id]||'div'));
  return blockedElements.get(id);
};
const blockedDocument = {
  documentElement:{lang:'en',dir:'ltr'},
  getElementById:blockedGet,
  createElement:tag=>new Element(tag)
};
const blockedStorage = {
  getItem:()=>null,
  setItem:()=>{throw new Error('Storage blocked');}
};
vm.runInNewContext(script,{document:blockedDocument,localStorage:blockedStorage,window:{confirm:()=>true},Date,Math});
const b=blockedGet;
b('demoService').value='0';
b('demoForm').listeners.submit({preventDefault(){}});
assert.match(b('demoMessage').textContent,/storage unavailable/i,'create must preserve storage warning');
b('demoList').children[0].children[2].children[0].click();
assert.match(b('demoMessage').textContent,/storage unavailable/i,'advance must preserve storage warning');
b('demoList').children[0].children[2].children[1].click();
assert.match(b('demoMessage').textContent,/storage unavailable/i,'delete must preserve storage warning');
b('demoService').value='0';
b('demoForm').listeners.submit({preventDefault(){}});
b('demoClear').click();
assert.match(b('demoMessage').textContent,/storage unavailable/i,'clear must preserve storage warning');

// Fixed clock and random output must not create identical references: otherwise
// deleting one fictional request would remove every request sharing its ID.
const collisionState = new Map([['sanad_preview_requests_v1',JSON.stringify([
  {id:'DEMO-AAAAAA',service:0,state:'draft'},
  {id:'DEMO-AAAAAA',service:1,state:'done'},
  {id:'DEMO-BBBBBB',service:2,state:'review'}
])]]);
const collisionElements = new Map();
const collisionGet = id => {
  if(!collisionElements.has(id))collisionElements.set(id,new Element(tags[id]||'div'));
  return collisionElements.get(id);
};
const collisionDocument = {
  documentElement:{lang:'en',dir:'ltr'},
  getElementById:collisionGet,
  createElement:tag=>new Element(tag)
};
const collisionStorage = {
  getItem:key=>collisionState.get(key)||null,
  setItem:(key,value)=>collisionState.set(key,String(value))
};
vm.runInNewContext(script,{
  document:collisionDocument,localStorage:collisionStorage,window:{confirm:()=>true},
  Date:{now:()=>1700000000000},Math:{random:()=>0.5}
});
const c=collisionGet;
assert.equal(c('demoList').children.length,2,'duplicate saved references must be ignored');
for(let i=0;i<3;i++){
  c('demoService').value='0';
  c('demoForm').listeners.submit({preventDefault(){}});
}
const collisionRows=JSON.parse(collisionState.get('sanad_preview_requests_v1'));
assert.equal(collisionRows.length,5);
assert.equal(new Set(collisionRows.map(row=>row.id)).size,5,'fixed clock and random must still yield unique IDs');
c('demoList').children[0].children[2].children[1].click();
const afterDelete=JSON.parse(collisionState.get('sanad_preview_requests_v1'));
assert.equal(afterDelete.length,4,'deleting one request must not delete another');
assert.equal(new Set(afterDelete.map(row=>row.id)).size,4);

console.log('PASS Sanad fictional request creation, local storage, workflow, filter, translation and clearing');
