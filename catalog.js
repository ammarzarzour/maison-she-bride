/* Maison She Bride public catalog adapter.
   Configure window.MSB_SUPABASE = {url:'https://PROJECT.supabase.co', publishableKey:'sb_publishable_...'}
   before loading this script. NEVER place service_role or secret keys in browser code. */
(function(){
'use strict';
const cfg=window.MSB_SUPABASE||{};
const url=typeof cfg.url==='string'?cfg.url.replace(/\/$/,''):'';
const key=typeof cfg.publishableKey==='string'?cfg.publishableKey:'';
const valid=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&/^(sb_publishable_|eyJ)/.test(key);
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
async function pagedProducts(){
 const query='select=id,store_id,category_id,title_ar,title_en,description_ar,description_en,price_usd,stock,product_images(image_url,position)&status=eq.published&stock=gt.0&order=created_at.desc,id.desc';
 const all=[];
 const seen=new Set();
 for(let page=0;page<maxPages;page++){
  const result=await get('products',query+'&limit='+pageSize+'&offset='+(page*pageSize));
  if(result.error||!result.configured)return {...result,rows:[]}; // Never display a partial catalog as complete.
  if(result.rows.length>pageSize)return {configured:true,rows:[],error:'Catalog page exceeds requested limit'};
  for(const row of result.rows){
   if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id))return {configured:true,rows:[],error:'Invalid or repeated product in catalog pagination'};
   // Reject malformed live prices/stock instead of showing NaN or misleading amounts.
   if((row.price_usd===null||row.price_usd===undefined||typeof row.price_usd==='boolean'||String(row.price_usd).trim()===''||!Number.isFinite(Number(row.price_usd)))||Number(row.price_usd)<0||(row.stock===null||row.stock===undefined||typeof row.stock==='boolean'||String(row.stock).trim()===''||!Number.isSafeInteger(Number(row.stock)))||Number(row.stock)<1)return {configured:true,rows:[],error:'Invalid price or stock in catalog'};
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
 categories:()=>get('categories','select=id,slug,name_ar,name_en&order=name_en.asc'),
 products:pagedProducts
};
})();
