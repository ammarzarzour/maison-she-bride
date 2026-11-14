'use strict';
const {readConfig}=require('./config.cjs');
const {createOrderServer}=require('./server.cjs');
async function start(env=process.env){
 const config=readConfig(env);
 let pool,handler;
 if(config.enabled){
  const {Pool}=require('pg');
  const {createClient}=require('@supabase/supabase-js');
  const {createPostgresOrderStore}=require('../postgres-order-store.cjs');
  const {createOrdersHandler,createSupabaseTokenVerifier}=require('../orders-http.cjs');
  pool=new Pool({connectionString:config.databaseUrl,max:5,connectionTimeoutMillis:5000,
   idleTimeoutMillis:30000,ssl:{rejectUnauthorized:true,...(config.ca?{ca:config.ca}:{})}});
  // Never print database errors or private connection details.
  pool.on('error',()=>{process.stderr.write('Database connection unavailable\n');});
  const client=createClient(config.supabaseUrl,config.publishableKey,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{fetch:(url,options={})=>fetch(url,{...options,
    signal:AbortSignal.any([options.signal,AbortSignal.timeout(8000)].filter(Boolean))})}
  });
  handler=createOrdersHandler({store:createPostgresOrderStore(pool),
   verifyAccessToken:createSupabaseTokenVerifier(client),allowedOrigins:config.origins});
 }
 const server=createOrderServer({enabled:config.enabled,handler});
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);server.listen(config.port,config.host,resolve);
  });
 }catch(error){if(pool)await pool.end();throw error;}
 return {server,async close(){
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(pool)await pool.end();
 }};
}
if(require.main===module){
 start().then(runtime=>{
  process.stdout.write('Orders server listening\n');
  let stopping=false;
  const shutdown=()=>{
   if(stopping)return;stopping=true;
   const timer=setTimeout(()=>process.exit(1),20000);timer.unref();
   runtime.close().then(()=>{clearTimeout(timer);process.exit(0);},()=>process.exit(1));
  };
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
 }).catch(()=>{process.stderr.write('Orders server startup failed; check protected configuration\n');process.exitCode=1;});
}
module.exports={start};
