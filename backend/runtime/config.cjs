'use strict';
function readConfig(env=process.env){
 const enabled=env.ORDERS_ENABLED==='true';
 if(env.ORDERS_ENABLED && !['true','false'].includes(env.ORDERS_ENABLED))throw new Error('INVALID_ENABLE_FLAG');
 const port=env.PORT===undefined?3000:Number(env.PORT);
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('INVALID_PORT');
 const base={enabled,port,host:env.HOST||'127.0.0.1'};
 if(!enabled)return base;
 let db,auth;
 try{db=new URL(env.DATABASE_URL);auth=new URL(env.SUPABASE_URL);}catch{throw new Error('SERVER_CONFIGURATION_REQUIRED');}
 if(!['postgres:','postgresql:'].includes(db.protocol)||!db.hostname||!db.username||!db.password)
  throw new Error('INVALID_DATABASE_CONFIGURATION');
 // pg connection-string SSL options override Pool options: forbid overrides.
 if([...db.searchParams.keys()].some(key=>/^ssl/i.test(key)))throw new Error('DATABASE_SSL_OVERRIDE_FORBIDDEN');
 if(auth.protocol!=='https:'||auth.username||auth.password||auth.search||auth.hash||auth.pathname!=='/' ||
    !auth.hostname.endsWith('.supabase.co'))throw new Error('INVALID_AUTH_ORIGIN');
 const key=env.SUPABASE_PUBLISHABLE_KEY;
 if(typeof key!=='string'||!key.startsWith('sb_publishable_'))throw new Error('PUBLISHABLE_AUTH_KEY_REQUIRED');
 const origins=(env.ORDER_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!origins.length)throw new Error('STOREFRONT_ORIGIN_REQUIRED');
 for(const origin of origins){
  let u;try{u=new URL(origin);}catch{throw new Error('INVALID_STOREFRONT_ORIGIN');}
  if(u.protocol!=='https:'||u.origin!==origin)throw new Error('INVALID_STOREFRONT_ORIGIN');
 }
 return {...base,databaseUrl:db.href,supabaseUrl:auth.origin,publishableKey:key,origins,ca:env.PG_CA_CERT};
}
module.exports={readConfig};
