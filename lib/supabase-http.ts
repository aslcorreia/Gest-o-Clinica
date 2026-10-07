import {env} from 'cloudflare:workers';

export function publicConfig() {
 const e=env as unknown as Record<string,string>;
 if(!e.SUPABASE_URL||!e.SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase configuration unavailable');
 return e;
}
export function serviceConfig(){const e=publicConfig();if(!e.SUPABASE_SECRET_KEY)throw new Error('Server database credential unavailable');return e;}
export function serviceHeaders(){const e=serviceConfig();return {apikey:e.SUPABASE_SECRET_KEY,Authorization:'Bearer '+e.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};}
export async function databaseRequest(body:unknown){
 const r=await fetch(serviceConfig().SUPABASE_URL+'/rest/v1/rpc/linguar_batch',{method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('Database operation failed ('+r.status+')');
 return r.json();
}
export async function authRequest(path:string,body?:unknown,token?:string){
 const e=publicConfig();return fetch(e.SUPABASE_URL+'/auth/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:e.SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
}
export function storage(){
 const objectPath=(id:string)=>id.split('/').map(encodeURIComponent).join('/');
 return {
  async get(id:string){const r=await fetch(serviceConfig().SUPABASE_URL+'/storage/v1/object/linguar-clinical/'+objectPath(id),{headers:serviceHeaders(),signal:AbortSignal.timeout(20000)});if(r.status===404)return null;if(!r.ok)throw new Error('File unavailable');return {body:r.body};},
  async put(id:string,data:ArrayBuffer,opts:{httpMetadata:{contentType:string}}){const r=await fetch(serviceConfig().SUPABASE_URL+'/storage/v1/object/linguar-clinical/'+objectPath(id),{method:'POST',headers:{...serviceHeaders(),'Content-Type':opts.httpMetadata.contentType},body:data,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Upload failed');},
  async delete(id:string){const r=await fetch(serviceConfig().SUPABASE_URL+'/storage/v1/object/linguar-clinical',{method:'DELETE',headers:serviceHeaders(),body:JSON.stringify({prefixes:[id]}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('File cleanup failed');}
 };
}
