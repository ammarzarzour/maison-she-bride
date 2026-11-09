const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'seller script missing');
const from=script.indexOf('function inventoryCsvCell(');
const to=script.indexOf("$('exportInventory').onclick=",from);
assert.ok(from>=0&&to>from,'CSV builder missing');
const context=vm.createContext({});
vm.runInContext(script.slice(from,to),context);
const csv=vm.runInContext("buildInventoryCsv([{id:'p1',title_ar:'=SUM(1,2)',title_en:'Dress \"gold\"',price_usd:12.5,stock:0,status:'draft'},{id:'p2',title_ar:'فستان',title_en:' +cmd',price_usd:0,stock:3,status:'published'}])",context);
assert.ok(csv.startsWith('\uFEFF"id","title_ar","title_en","price_usd","stock","status"\r\n'));
assert.ok(csv.includes('"\'=SUM(1,2)"'),'formula must be escaped');
assert.ok(csv.includes('"Dress ""gold"""'),'quotes must be doubled');
assert.ok(csv.includes('"\' +cmd"'),'leading whitespace formula must be escaped');
assert.ok(csv.includes('"فستان"'),'Arabic characters must be preserved');
const hiddenFormula=vm.runInContext("inventoryCsvCell('\\u200b=2+2')",context);
assert.equal(hiddenFormula,'"\'\u200b=2+2"','zero-width prefix must not bypass formula escaping');
const bidiFormula=vm.runInContext("inventoryCsvCell('\\u202e+cmd')",context);
assert.equal(bidiFormula,'"\'\u202e+cmd"','bidi control must not bypass formula escaping');
for(const [prefix,label] of [['\\u061c','Arabic letter mark'],['\\u00ad','soft hyphen'],['\\u034f','combining grapheme joiner'],['\\u180e','Mongolian vowel separator'],['\\ufe0f','variation selector']]){
 const cell=vm.runInContext("inventoryCsvCell('"+prefix+"=1+1')",context);
 assert.equal(cell, '"' + String.fromCharCode(39) + JSON.parse('"' + prefix + '"') + '=1+1"', label + ' must not bypass formula escaping');
}
assert.equal(csv.trim().split('\r\n').length,3);

// Exercise the same filtering and sorting functions used by both the visible
// inventory and its CSV export. Export must include all matching pages, not
// only the 25 rows currently displayed.
const filterStart=script.indexOf('function normalizeSellerSearch(');
const filterEnd=script.indexOf('const SELLER_DISPLAY_PAGE_SIZE=',filterStart);
assert.ok(filterStart>=0&&filterEnd>filterStart,'seller filter and sorting functions missing');
vm.runInContext(script.slice(filterStart,filterEnd).replace(/^.*\$\('inventory(?:Search|Filter|Sort)'\)\.addEventListener.*$/gm,''),context);
const inventory=Array.from({length:30},(_,i)=>({
 id:'item-'+i,title_ar:i===0?'فستان أحمر':'فستان',title_en:i===0?'Red Dress':'Dress',
 price_usd:10,stock:i===0?0:i,status:i===0?'draft':'published'
}));
context.inventory=inventory;
const filtered=vm.runInContext("sortSellerInventory(filterSellerInventory(inventory,'فستان','published'),'stockDesc','ar')",context);
assert.equal(filtered.length,29,'filtered export should include every matching product beyond display page one');
const accentFiltered=vm.runInContext("filterSellerInventory(inventory,'فستان احمر','all')",context);
assert.equal(accentFiltered.length,1,'Arabic hamza normalization should match inventory search');
const outFiltered=vm.runInContext("filterSellerInventory(inventory,'','out')",context);
assert.equal(outFiltered.length,1,'out-of-stock CSV filter must include only zero-stock products');
assert.equal(filtered[0].stock,29,'CSV should use selected descending stock order');
const filteredCsv=vm.runInContext("buildInventoryCsv(sortSellerInventory(filterSellerInventory(inventory,'فستان','published'),'stockDesc','ar'))",context);
assert.equal(filteredCsv.trim().split('\r\n').length,30,'CSV must contain header and all 29 filtered rows');
assert.ok(!filteredCsv.includes('"item-0"'),'CSV must omit excluded draft products');
assert.ok(filteredCsv.indexOf('"item-29"')<filteredCsv.indexOf('"item-1"'),'CSV row order must match selected sort');

assert.ok(html.includes("$('exportInventory').disabled=true"),'export disabled on invalidation and signout');
assert.ok(html.includes("$('exportInventory').disabled=false"),'export enabled only after complete load');
assert.ok(html.includes("buildInventoryCsv(sortSellerInventory(filterSellerInventory(cachedSellerProducts,$('inventorySearch').value,$('inventoryFilter').value||'all'),$('inventorySort').value||'newest',sellerLocale()))"),'CSV export must respect the current search, stock filter and sort without changing server data');
assert.ok(html.includes('Export filtered inventory CSV'),'English export label must describe filtered results');
assert.ok(html.includes('تصدير نتائج الجرد المصفّاة CSV'),'Arabic export label must describe filtered results');
assert.ok(html.includes("store.status!=='approved'"),'authenticated approved store guard required');
assert.ok(html.includes('exportInventorySession={epoch,authToken,ownerId,storeId}'),'export snapshot must be bound to session and store');
assert.ok(html.includes('sellerSessionActive(exportInventorySession.epoch,exportInventorySession.authToken,exportInventorySession.ownerId,exportInventorySession.storeId)'),'export must reject changed account or session');
assert.match(html,/exportInventorySession=null;cachedSellerProducts=null;[^\n]*\$\('exportInventory'\)\.disabled=true;/,'authentication and store refresh must invalidate old exports');
assert.match(html,/cachedSellerProducts=null;exportInventorySession=null;[^\n]*\$\('exportInventory'\)\.disabled=true;/,'inventory refresh and logout must invalidate old exports');
assert.ok(html.includes("}catch(error){\n  message(tr('exportFailed'));"),'download errors should show localized feedback');
assert.ok(html.includes("if(link)link.remove();"),'temporary download links must be cleaned up even if click fails');
assert.ok(html.includes("if(url!==null)URL.revokeObjectURL(url);"),'object URLs must be released only after successful creation');
console.log('PASS safe bilingual read-only seller inventory CSV and session binding');
