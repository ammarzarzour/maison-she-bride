/* Maison She Bride public catalog adapter.
   Configure window.MSB_SUPABASE = {url:'https://PROJECT.supabase.co', publishableKey:'sb_publishable_...'}
   before loading this script. NEVER place service_role or secret keys in browser code. */
(function(){
'use strict';
const cfg=window.MSB_SUPABASE||{};
const url=typeof cfg.url==='string'?cfg.url.replace(/\/$/,''):'';
const key=typeof cfg.publishableKey==='string'?cfg.publishableKey:'';
// Legacy JWT keys are accepted only when their payload explicitly declares the public anon role.
function publicKey(value){
 if(value.startsWith('sb_publishable_'))return value.length>'sb_publishable_'.length;
 if(!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return false;
 try{
  const part=value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const payload=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
  return payload&&payload.role==='anon';
 }catch(e){return false;}
}
const valid=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&publicKey(key);
const timeout=8000;
const pageSize=100;
const maxPages=10; // Safety bound: do not issue unbounded requests.
async function get(table,query){
 if(!valid)return {configured:false,rows:[],error:null};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url+'/rest/v1/'+table+'?'+query,{
   headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
   signal:controller.signal,cache:'no-store'
  });
  if(!response.ok)throw new Error('Catalog request failed ('+response.status+')');
  const rows=await response.json();
  if(!Array.isArray(rows))throw new Error('Invalid catalog response');
  return {configured:true,rows,error:null};
 }catch(e){return {configured:true,rows:[],error:e.message||'Catalog unavailable'};}
 finally{clearTimeout(timer);}
}
async function pagedCategories(){
 const query='select=id,slug,name_ar,name_en&order=id.asc';
 const all=[];const seen=new Set();const slugs=new Set();
 for(let page=0;page<maxPages;page++){
  const result=await get('categories',query+'&limit='+pageSize+'&offset='+(page*pageSize));
  if(result.error||!result.configured)return {...result,rows:[]};
  if(result.rows.length>pageSize)return {configured:true,rows:[],error:'Category page exceeds requested limit'};
  for(const row of result.rows){
   if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id)||typeof row.slug!=='string'||!row.slug.trim()||slugs.has(row.slug)||typeof row.name_ar!=='string'||!row.name_ar.trim()||typeof row.name_en!=='string'||!row.name_en.trim())return {configured:true,rows:[],error:'Invalid or repeated category in catalog pagination'};
   seen.add(row.id);slugs.add(row.slug);all.push(row);
  }
  if(result.rows.length<pageSize)return {configured:true,rows:all,error:null};
 }
 const probe=await get('categories',query+'&limit=1&offset='+(maxPages*pageSize));
 if(probe.error||!probe.configured)return {...probe,rows:[]};
 if(probe.rows.length>1)return {configured:true,rows:[],error:'Category overflow probe exceeds requested limit'};
 if(probe.rows.length)return {configured:true,rows:[],error:'Categories exceed the supported page limit'};
 return {configured:true,rows:all,error:null};
}
async function pagedProducts(){
 const query='select=id,store_id,category_id,title_ar,title_en,description_ar,description_en,price_usd,stock,product_images(image_url,position)&status=eq.published&stock=gt.0&order=created_at.desc,id.desc';
 const all=[];
 const seen=new Set();
 for(let page=0;page<maxPages;page++){
  const result=await get('products',query+'&limit='+pageSize+'&offset='+(page*pageSize));
  if(result.error||!result.configured)return {...result,rows:[]}; // Never display a partial catalog as complete.
  if(result.rows.length>pageSize)return {configured:true,rows:[],error:'Catalog page exceeds requested limit'};
  for(const row of result.rows){
   if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))return {configured:true,rows:[],error:'Invalid or repeated product in catalog pagination'};
   // Both languages must have usable product names; never render undefined or empty cards.
   if(typeof row.title_ar!=='string'||!row.title_ar.trim()||typeof row.title_en!=='string'||!row.title_en.trim())return {configured:true,rows:[],error:'Invalid bilingual product title in catalog'};
   // Reject malformed live prices/stock instead of showing NaN or misleading amounts.
   if((!['number','string'].includes(typeof row.price_usd)||String(row.price_usd).trim()===''||!Number.isFinite(Number(row.price_usd)))||Number(row.price_usd)<0||(!['number','string'].includes(typeof row.stock)||String(row.stock).trim()===''||!Number.isSafeInteger(Number(row.stock)))||Number(row.stock)<1)return {configured:true,rows:[],error:'Invalid price or stock in catalog'};
   // Images must be HTTPS URLs. Reject unexpected schemes and malformed image metadata.
   if(row.product_images!==null&&row.product_images!==undefined){
    if(!Array.isArray(row.product_images))return {configured:true,rows:[],error:'Invalid product images'};
    for(const img of row.product_images){
     if(!img||typeof img.image_url!=='string'||!/^https:\/\//i.test(img.image_url)||!(['number','string'].includes(typeof (img.position??0)))||String(img.position??0).trim()===''||!Number.isSafeInteger(Number(img.position??0))||Number(img.position??0)<0)return {configured:true,rows:[],error:'Invalid product image URL or position'};
     try{const parsed=new URL(img.image_url);if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)return {configured:true,rows:[],error:'Invalid product image URL'};}
     catch{return {configured:true,rows:[],error:'Invalid product image URL'};}
    }
   }
   seen.add(row.id);
   all.push(row);
  }
  if(result.rows.length<pageSize)return {configured:true,rows:all,error:null};
 }
 // A full last page may be exactly the limit. Probe one additional row before rejecting.
 const probe=await get('products',query+'&limit=1&offset='+(maxPages*pageSize));
 if(probe.error||!probe.configured)return {...probe,rows:[]};
 if(probe.rows.length>1)return {configured:true,rows:[],error:'Catalog overflow probe exceeds requested limit'};
 if(probe.rows.length===0)return {configured:true,rows:all,error:null};
 return {configured:true,rows:[],error:'Catalog exceeds the supported page limit'};
}
window.MSB_CATALOG={
 configured:valid,
 categories:pagedCategories,
 products:pagedProducts
};
})();
