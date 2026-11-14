'use strict';
const {submitOrder}=require('./order-service.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class OrderHttpError extends Error {
 constructor(status,code){super(code);this.status=status;this.code=code;}
}
function createSupabaseTokenVerifier(client){
 if(typeof client?.auth?.getUser!=='function') throw new Error('AUTH_CLIENT_REQUIRED');
 return async token=>{
  let result;
  try { result=await client.auth.getUser(token); }
  catch {throw new OrderHttpError(503,'AUTH_UNAVAILABLE');}
  if(result.error){
   const status=result.error.status;
   throw new OrderHttpError([400,401,403].includes(status)?401:503,
    [400,401,403].includes(status)?'UNAUTHORIZED':'AUTH_UNAVAILABLE');
  }
  const user=result.data?.user;
  if(!user || !UUID.test(user.id || '') || user.is_anonymous===true)
   throw new OrderHttpError(401,'UNAUTHORIZED');
  return {id:user.id};
 };
}
async function readJson(request){
 const length=request.headers.get('content-length');
 if(length!==null && (!/^[0-9]+$/.test(length)||Number(length)>16384))
  throw new OrderHttpError(413,'BODY_TOO_LARGE');
 if(!request.body) throw new OrderHttpError(400,'INVALID_BODY');
 const reader=request.body.getReader();let bytes=0;const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>16384){await reader.cancel();throw new OrderHttpError(413,'BODY_TOO_LARGE');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const body=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
 catch{throw new OrderHttpError(400,'INVALID_JSON');}
}
function createOrdersHandler({store,verifyAccessToken,allowedOrigins=[]}){
 if(!store || typeof store.transaction!=='function' || typeof verifyAccessToken!=='function')
  throw new Error('ORDER_DEPENDENCIES_REQUIRED');
 const origins=new Set(allowedOrigins.map(origin=>{
  const parsed=new URL(origin);
  if(parsed.origin!==origin || !['https:','http:'].includes(parsed.protocol)) throw new Error('INVALID_ORIGIN');
  return origin;
 }));
 return async request=>{
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
  const reply=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
  try{
   if(new URL(request.url).pathname!=='/orders') return reply(404,{error:'NOT_FOUND'});
   const origin=request.headers.get('origin');
   if(origin && !origins.has(origin)) return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
   if(origin) headers['access-control-allow-origin']=origin;
   if(request.method==='OPTIONS'){
    headers['access-control-allow-methods']='POST, OPTIONS';
    headers['access-control-allow-headers']='Authorization, Content-Type, Idempotency-Key';
    return reply(204);
   }
   if(request.method!=='POST'){headers.allow='POST, OPTIONS';return reply(405,{error:'METHOD_NOT_ALLOWED'});}
   if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type')||''))
    throw new OrderHttpError(415,'JSON_REQUIRED');
   const auth=request.headers.get('authorization')||'';
   const match=/^Bearer ([^\s]{1,8192})$/.exec(auth);
   if(!match) throw new OrderHttpError(401,'UNAUTHORIZED');
   const key=request.headers.get('idempotency-key');
   if(!key || !UUID.test(key)) throw new OrderHttpError(400,'INVALID_REQUEST_KEY');
   // Buyer identity comes ONLY from the server verifier, never decoded browser claims.
   const user=await verifyAccessToken(match[1]);
   if(!user || typeof user.id!=='string' || !UUID.test(user.id)) throw new OrderHttpError(401,'UNAUTHORIZED');
   const body=await readJson(request);
   if(!body || Array.isArray(body) || typeof body!=='object' ||
      Object.keys(body).length!==1 || !Object.hasOwn(body,'items')) throw new OrderHttpError(400,'INVALID_BODY');
   const result=await submitOrder(store,user.id,key,body.items);
   return reply(result.replayed?200:201,{order_id:result.order_id,replayed:result.replayed});
  }catch(error){
   if(error instanceof OrderHttpError) return reply(error.status,{error:error.code});
   const code=error?.message;
   if(['IDEMPOTENCY_CONFLICT','INSUFFICIENT_STOCK','INVENTORY_CONFLICT','PRODUCT_UNAVAILABLE'].includes(code))
    return reply(409,{error:code});
   if(['INVALID_ID','INVALID_ITEMS','INVALID_ITEM_FIELDS','DUPLICATE_PRODUCT','INVALID_QUANTITY'].includes(code))
    return reply(400,{error:code});
   // No SQL errors, tokens, connection strings, prices, or stack traces in responses.
   return reply(503,{error:'ORDER_SERVICE_UNAVAILABLE'});
  }
 };
}
module.exports={createOrdersHandler,createSupabaseTokenVerifier,OrderHttpError};
