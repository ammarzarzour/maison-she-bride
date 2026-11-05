const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)][0]?.[1];
assert.ok(script);
assert.match(script,/addEventListener\('error',[\s\S]*?,true\)/,'image error listener must capture non-bubbling errors');
const nodes=new Map();
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const el={value:'',textContent:'',innerHTML:'',disabled:false,handlers:{},
 options:id==='sortProducts'?[{},{},{},{}]:[],
 classList:{add(){},remove(){},toggle(){}},
 addEventListener(event,fn,capture){this.handlers[event]={fn,capture}},
 setAttribute(){},scrollIntoView(){}};
 nodes.set(id,el);return el;
}
const document={documentElement:{},getElementById:node,addEventListener(){}};
const localStorage={getItem(){return null},setItem(){}};
const context=vm.createContext({document,localStorage,navigator:{language:'en-US'},Intl,URL});
vm.runInContext(script,context);
vm.runInContext("items=[{id:'dress',cat:'bridal',ar:'فستان',en:'Dress',usd:25,stock:2,icon:'🛍️',images:['https://example.org/a.jpg','https://example.org/b.jpg']}];catalogReady=true;render()",context);
assert.match(node('products').innerHTML,/data-image-fallback hidden/);
assert.match(node('products').innerHTML,/src="https:\/\/example.org\/a.jpg"/);
assert.match(node('products').innerHTML,/data-photo-index="1"/);
assert.equal(node('products').handlers.error.capture,true);
const fallback={hidden:true};
const image={tagName:'IMG',hidden:false,src:'https://example.org/a.jpg',closest:()=>card};
const buttons=[0,1].map(i=>({dataset:{photo:'dress',photoIndex:String(i)},attrs:{},setAttribute(k,v){this.attrs[k]=v}}));
const card={querySelector(selector){if(selector==='img')return image;if(selector==='[data-image-fallback]')return fallback;return null},querySelectorAll(){return buttons}};
node('products').handlers.error.fn({target:image});
assert.equal(image.hidden,true,'broken remote image should be hidden');
assert.equal(fallback.hidden,false,'visible icon should replace broken remote image');
node('products').handlers.error.fn({target:{tagName:'DIV',closest:()=>card}});
assert.equal(fallback.hidden,false,'unrelated errors must be ignored');
const photoClick={dataset:buttons[1].dataset,closest(selector){if(selector==='[data-photo][data-photo-index]')return this;if(selector==='article')return card;return null}};
node('products').handlers.click.fn({target:photoClick});
assert.equal(image.src,'https://example.org/b.jpg');
assert.equal(image.hidden,false,'choosing another image restores image visibility');
assert.equal(fallback.hidden,true,'choosing another image hides placeholder');
assert.equal(buttons[1].attrs['aria-pressed'],'true');
assert.equal(buttons[0].attrs['aria-pressed'],'false');
node('products').handlers.error.fn({target:image});
assert.equal(fallback.hidden,false,'fallback should work on every failed image');
vm.runInContext("langSetting='ar';render()",context);
assert.equal(document.documentElement.dir,'rtl');
assert.match(node('products').innerHTML,/data-image-fallback hidden/);
assert.match(node('products').innerHTML,/src="https:\/\/example.org\/b.jpg"/,'selected gallery image survives language switch');
console.log('PASS broken product images show icon, gallery retries and bilingual selection persists');
