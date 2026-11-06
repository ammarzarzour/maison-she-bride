const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('seller.html','utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const preview=source.slice(source.indexOf('function sellerDraftPreviewData('),source.indexOf('let sellerPreviewImageUrl='));
const exportCode=source.slice(source.indexOf('function sellerDraftExportRecord('),source.indexOf('function sellerParseDraftImport('));
const parseCode=source.slice(source.indexOf('function sellerParseDraftImport('),source.indexOf('let sellerDraftImportGeneration='));
const ctx=vm.createContext({});vm.runInContext(preview+exportCode+parseCode,ctx);
const draft={format:'maison-she-bride-product-draft',version:1,status:'draft',title_ar:'فستان',title_en:'Dress',description_ar:'وصف',description_en:'Description',category_id:'cat1',price_usd:'12.50',stock:2};
const parse=(d,c=[{id:'cat1'}])=>vm.runInContext('sellerParseDraftImport('+JSON.stringify(d)+','+JSON.stringify(c)+')',ctx);
assert.equal(parse(draft).title_ar,'فستان');
assert.equal(parse(draft).price_usd,'12.50');
for(const bad of [{version:2},{status:'published'},{stock:1.5},{stock:-1},{price_usd:'0'},{price_usd:'1e3'},{category_id:'other'},{title_en:''},{description_en:'x'.repeat(3001)},{customer_name:'Private'}]){
 assert.equal(parse({...draft,...bad}),null,JSON.stringify(bad));
}
assert.equal(parse(null),null);
assert.equal(parse([draft]),null);
assert.equal(parse(draft,[]),null);
// Imported drafts must never accept unexpected personal or payment fields.
for(const field of ['customer_email','customer_phone','payment_token','shipping_address']){
 assert.equal(parse({...draft,[field]:'unexpected'}),null,field);
}
// A draft must refer to a category currently available to this seller.
assert.equal(parse(draft,[{id:'different'}]),null);

assert.ok(html.includes('id="importProductDraft"'));
assert.ok(source.includes('file.size>32768'),'file size bounded');
assert.ok(source.includes('generation!==sellerDraftImportGeneration'),'late reads ignored');
assert.ok(source.includes('sellerSessionActive(epoch,authToken,ownerId)'),'session protected');
assert.ok(source.includes("$('photo').value=''"),'import does not retain old photo');
assert.ok(source.includes("++sellerDraftImportGeneration"),'logout invalidates pending import');
assert.ok(!parseCode.includes('fetch(')&&!parseCode.includes('request('),'no network');
console.log('PASS local bilingual JSON draft import validation');
