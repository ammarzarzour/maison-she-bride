'use strict';
const {createServer}=require('node:http');
const {Readable}=require('node:stream');
function createOrderServer({enabled=false,handler}={}){
 if(enabled && typeof handler!=='function') throw new Error('ORDER_HANDLER_REQUIRED');
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(req.method==='GET' && req.url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({status:'ok',orders_enabled:enabled}));return;
   }
   if(!enabled){
    req.resume();
    res.writeHead(503,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'ORDERS_DISABLED'}));return;
   }
   // Fixed internal base; do not trust the incoming Host header for routing.
   const init={method:req.method,headers:req.headers};
   if(!['GET','HEAD'].includes(req.method)){init.body=Readable.toWeb(req);init.duplex='half';}
   const response=await handler(new Request(new URL(req.url,'http://orders.internal'),init));
   if(res.destroyed)return;
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{
   if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});
   if(!res.destroyed)res.end(JSON.stringify({error:'ORDER_SERVICE_UNAVAILABLE'}));
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return server;
}
module.exports={createOrderServer};
