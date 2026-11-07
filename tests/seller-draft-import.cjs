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
assert.equal(parse(draft,null),null,'missing category data rejected safely');
assert.equal(parse(draft,{}),null,'invalid category data rejected safely');
assert.equal(parse(draft,[null]),null,'null category entry rejected safely');

assert.ok(html.includes('id="importProductDraft"'));
assert.ok(source.includes('file.size>32768'),'file size bounded');
assert.ok(source.includes('generation!==sellerDraftImportGeneration'),'late reads ignored');
assert.ok(source.includes('sellerSessionActive(epoch,authToken,ownerId)'),'session protected');
assert.ok(source.includes("$('photo').value=''"),'import does not retain old photo');
assert.ok(source.includes("++sellerDraftImportGeneration"),'logout invalidates pending import');
assert.ok(!parseCode.includes('fetch(')&&!parseCode.includes('request('),'no network');
// Clearing the local form must invalidate asynchronous imports and release preview assets.
assert.ok(html.includes('id="clearProductDraft"'));
const clear=source.slice(source.indexOf("$('clearProductDraft').addEventListener"),source.indexOf("$('previewProduct').addEventListener"));
for(const fragment of ["++sellerDraftImportGeneration","$('productForm').reset()","$('photo').value=''","$('importProductDraft').value=''","releaseSellerPreviewImage()","$('productPreview').replaceChildren()","message(tr('draftCleared'))"]){
 assert.ok(clear.includes(fragment),fragment);
}
assert.ok(!clear.includes('fetch(')&&!clear.includes('request('),'clear is local only');
assert.ok(source.includes('"clearDraft":"Clear local draft fields"'));
assert.ok(source.includes('"clearDraft":"مسح حقول المسودة المحلية"'));
// User edits made during an asynchronous file read must win over the stale file.
const editGuards=source.slice(source.indexOf('let sellerDraftImportGeneration=0;'),source.indexOf("$('importProductDraft').addEventListener"));
assert.ok(editGuards.includes("addEventListener('input'"));
assert.ok(editGuards.includes("addEventListener('change'"));
assert.ok(editGuards.includes("event.target!==$('importProductDraft')"));
assert.ok(editGuards.includes('++sellerDraftImportGeneration'));
// Importing must not silently replace a seller's unfinished form or selected image.
const importHandler=source.slice(source.indexOf("$('importProductDraft').addEventListener"),source.indexOf("$('downloadProductDraft').addEventListener"));
assert.ok(importHandler.includes("window.confirm(tr('importOverwriteConfirm'))"));
assert.ok(importHandler.includes("message(tr('importCancelled'));return"));
assert.ok(importHandler.includes("Boolean($('photo').files?.length)"));
assert.ok(importHandler.indexOf("window.confirm(tr('importOverwriteConfirm'))")<importHandler.indexOf("for(const [id,key]"));
assert.ok(importHandler.includes("generation!==sellerDraftImportGeneration||!sellerSessionActive(epoch,authToken,ownerId)"),'recheck session after confirmation');
assert.ok(source.includes('"importOverwriteConfirm":"Importing will replace the current fields and selected image. Continue?"'));
assert.ok(source.includes('"importCancelled":"تم إلغاء الاستيراد، وبقيت الحقول الحالية كما هي."'));
// Category-only edits are unsaved work too, while untouched defaults are not.
assert.ok(source.includes("let sellerDraftCategoryEdited=false"));
assert.ok(source.includes("$('category').addEventListener('change',()=>{sellerDraftCategoryEdited=true;})"));
assert.ok(importHandler.includes("sellerDraftCategoryEdited||Boolean($('photo').files?.length)"));
assert.ok(importHandler.includes("$('stock').defaultValue"));
assert.ok(importHandler.includes("sellerDraftCategoryEdited=false"),'successful import resets dirty state');
assert.ok(clear.includes("sellerDraftCategoryEdited=false"),'clearing resets dirty state');
// The download must retain its blob URL long enough for asynchronous mobile downloads.
const downloadHandler=source.slice(source.indexOf("$('downloadProductDraft').addEventListener"),source.indexOf("$('clearProductDraft').addEventListener"));
assert.ok(downloadHandler.includes("anchor.click()"),'download is initiated');
assert.ok(downloadHandler.includes("setTimeout(()=>URL.revokeObjectURL(url),30000)"),'download URL cleanup deferred');
assert.ok(!downloadHandler.includes("if(url)URL.revokeObjectURL(url)"),'URL not revoked synchronously');
console.log('PASS local bilingual JSON draft import validation');
