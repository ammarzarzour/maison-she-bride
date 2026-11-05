const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const from=script.indexOf('function normalizeSellerSearch(');
const to=script.indexOf("$('inventorySearch').addEventListener",from);
assert.ok(from>=0&&to>from,'search normalizer and filter must be extracted together');
const ctx=vm.createContext({});
vm.runInContext(script.slice(from,to),ctx);
const rows=[
{id:'a',title_ar:'فستان زفاف',title_en:'Wedding Dress',status:'published',stock:0},
{id:'b',title_ar:'حقيبة ذهبية',title_en:'Gold Bag',status:'draft',stock:2},
{id:'c',title_ar:'حذاء',title_en:'Gold Shoes',status:'archived',stock:8}
];
const find=(q,status)=>{
 ctx.rows=rows;ctx.q=q;ctx.status=status;
 return vm.runInContext('filterSellerInventory(rows,q,status).map(p=>p.id).join(",")',ctx);
};
assert.equal(find('gold','all'),'b,c');
assert.equal(find('gold bag','all'),'b');
assert.equal(find('زَفَاف','out'),'a','Arabic harakat should not block search');
assert.equal(find('حَقِيبَة','all'),'b','Arabic diacritics should not block search');
assert.equal(find('حـقيبة','all'),'b','Arabic tatweel should not block search');
assert.equal(find('góld','all'),'b,c','Latin accents should not block search');
assert.equal(find('زفاف','out'),'a');
assert.equal(find('','low'),'b');
assert.equal(find('','published'),'a');
assert.equal(find('','archived'),'c');
assert.equal(find('missing','all'),'');
assert.ok(html.includes("showStockSummary(rows);\n const visible=filterSellerInventory"),'summary must use full inventory');
assert.ok(html.includes("const csv=buildInventoryCsv(cachedSellerProducts)"),'export must use full inventory');
assert.ok(html.includes("$('inventorySearch').disabled=true"),'filter disabled during invalidation');
console.log('PASS bilingual seller inventory filters and full export separation');
