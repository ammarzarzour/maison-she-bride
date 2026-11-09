const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const from=script.indexOf('function sortSellerInventory(');
const to=script.indexOf("$('inventorySort').addEventListener",from);
assert.ok(from>=0&&to>from);
const ctx=vm.createContext({});
vm.runInContext(script.slice(from,to),ctx);
const rows=[
{id:'b',title_ar:'حقيبة',title_en:'Bag',stock:3},
{id:'c',title_ar:'فستان',title_en:'Dress',stock:0},
{id:'a',title_ar:'إكسسوار',title_en:'Accessory',stock:3}
];
const sort=(mode,locale)=>vm.runInContext('sortSellerInventory(rows,mode,locale).map(p=>p.id).join(",")',vm.createContext({rows,mode,locale,sortSellerInventory:ctx.sortSellerInventory}));
assert.equal(sort('stockAsc','ar'),'c,a,b');
assert.equal(sort('stockDesc','en'),'a,b,c');
assert.equal(sort('name','en'),'a,b,c');
assert.equal(sort('newest','en'),'b,c,a');
assert.equal(rows.map(p=>p.id).join(','),'b,c,a','sorting must not mutate original inventory or CSV order');
assert.ok(html.includes('id="inventorySort" disabled'));
assert.ok(html.includes("$('inventorySort').disabled=true"),'sorting disabled during refresh or logout');
assert.ok(html.includes("$('inventorySort').disabled=false"),'sorting enabled only after full inventory load');
assert.ok(html.includes("sortSellerInventory(filterSellerInventory("),'sort must apply after filters');
assert.ok(html.includes("buildInventoryCsv(sortSellerInventory(filterSellerInventory(cachedSellerProducts"),'CSV export must reflect the current filters and sort while leaving source inventory unchanged');
console.log('PASS seller inventory stock/name sorting and full CSV separation');
