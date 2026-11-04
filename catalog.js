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
window.MSB_CATALOG={
 configured:valid,
 categories:()=>get('categories','select=id,slug,name_ar,name_en&order=name_en.asc'),
 products:()=>get('products','select=id,store_id,category_id,title_ar,title_en,description_ar,description_en,price_usd,stock,product_images(image_url,position)&status=eq.published&stock=gt.0&order=created_at.desc&limit=100')
};
})();
