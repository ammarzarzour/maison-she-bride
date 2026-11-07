const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('sanad-preview.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
assert.equal(scripts.length,1,'Sanad service language controller should have a single inline script');
assert.doesNotMatch(scripts[0],/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(/,'Sanad public demo cannot submit data');

function setup(device='ar-SY',saved=null,denyRead=false,denyWrite=false){
 const values=new Map(saved===null?[]:[['sanad_lang',saved]]);
 const nodes=new Map();
 class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.textContent='';this.placeholder='';this.listeners={};this.className='';}
  replaceChildren(...children){this.children=children}
  append(...children){this.children.push(...children)}
  addEventListener(kind,fn){this.listeners[kind]=fn}
  scrollIntoView(){}
 }
 function node(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)}
 const document={documentElement:{lang:'ar',dir:'rtl'},getElementById:node,createElement:tag=>new Element(tag)};
 const localStorage={
  getItem(key){if(denyRead)throw new Error('Storage read blocked');return values.get(key)??null},
  setItem(key,value){if(denyWrite)throw new Error('Storage write blocked');values.set(key,String(value))}
 };
 const context=vm.createContext({document,localStorage,navigator:{language:device}});
 vm.runInContext(scripts[0],context,{filename:'sanad-preview.html#language'});
 function change(value){node('language').value=value;node('language').listeners.change({target:{value}})}
 return {document,node,values,change};
}

const arabic=setup();
assert.equal(arabic.document.documentElement.lang,'ar');
assert.equal(arabic.document.documentElement.dir,'rtl');
assert.equal(arabic.node('language').value,'auto');
assert.equal(arabic.node('services').children.length,6);
assert.match(arabic.node('notice').textContent,/غير رسمي|تجريبي/);
arabic.change('en');
assert.equal(arabic.document.documentElement.lang,'en');
assert.equal(arabic.document.documentElement.dir,'ltr');
assert.equal(arabic.values.get('sanad_lang'),'en');
assert.equal(arabic.node('language').value,'en');
assert.match(arabic.node('notice').textContent,/Unofficial demo/);
assert.equal(arabic.node('services').children.length,6);
arabic.node('serviceSearch').value='Appointments';
arabic.node('serviceSearch').listeners.input();
assert.equal(arabic.node('services').children.length,1);
assert.match(arabic.node('services').children[0].children[0].textContent,/Appointments/);

arabic.change('bogus');
assert.equal(arabic.node('language').value,'auto','invalid selection must reset to auto');
assert.equal(arabic.document.documentElement.lang,'ar');
assert.equal(arabic.values.get('sanad_lang'),'auto');

const savedEnglish=setup('ar-SY','en');
assert.equal(savedEnglish.document.documentElement.dir,'ltr','saved manual language overrides device');
const savedArabic=setup('en-GB','ar');
assert.equal(savedArabic.document.documentElement.dir,'rtl');
const autoEnglish=setup('en-GB','auto');
assert.equal(autoEnglish.document.documentElement.dir,'ltr');
const invalid=setup('ar-SY','invalid-preference');
assert.equal(invalid.document.documentElement.dir,'rtl');
assert.equal(invalid.node('language').value,'auto');

const blocked=setup('en-GB','ar',true,true);
assert.equal(blocked.document.documentElement.dir,'ltr','blocked reads fall back to device');
blocked.change('ar');
assert.equal(blocked.document.documentElement.dir,'rtl','manual language must work without writable storage');
blocked.change('en');
assert.equal(blocked.document.documentElement.dir,'ltr');
assert.equal(blocked.node('services').children.length,6);

console.log('PASS Sanad device/browser language, persisted override, invalid values, blocked storage and service search');
const searchDemo=setup('ar-SY');
function findServices(q){searchDemo.node('serviceSearch').value=q;searchDemo.node('serviceSearch').listeners.input();return searchDemo.node('services').children}
assert.equal(findServices('إِدَارَة الهُوِيَّة').length,1);
assert.equal(findServices('accounts الهوية').length,1);
searchDemo.change('en');
assert.equal(searchDemo.node('services').children.length,1,'search survives language switch');
assert.equal(searchDemo.node('services').children[0].children[0].textContent,'Identity & accounts');
assert.equal(findServices('  verification   identity ').length,1);
assert.equal(findServices('مواعيد documents').length,0,'all terms must match the same service');
assert.equal(findServices('المواعيد').length,1);
searchDemo.node('services').children[0].children[2].listeners.click();
assert.equal(searchDemo.node('demoService').value,'3','filtered service keeps its original request type');
assert.equal(findServices('  ').length,6);
console.log('PASS normalized bilingual multiword service search and correct service action');
