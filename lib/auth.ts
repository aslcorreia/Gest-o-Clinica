import {cookies} from 'next/headers';
import {authRequest,publicConfig} from './supabase-http';
import {database} from './supabase-database';
import {eligiblePatient} from './family';
export type User={userId:string;email:string;displayName:string};
type Session={access_token:string;refresh_token:string;expires_in?:number};
const accessName='linguar-access',refreshName='linguar-refresh';
const emailValue=(s:string)=>s.trim().toLowerCase();
export async function authorizedEmail(email:string){
 email=emailValue(email);if(email===emailValue(publicConfig().CLINIC_OWNER_EMAIL||''))return true;
 const d=database(),member=await d.prepare('SELECT * FROM memberships WHERE email=?').bind(email).first<any>();
 if(member){if(!member.enabled)return false;const profile=await d.prepare("SELECT data FROM records WHERE clinic=? AND id=? AND kind='team'").bind(member.clinic,member.clinic+':'+member.therapist).first<any>();return !!profile&&!['Inativo','Arquivado'].includes(JSON.parse(profile.data).status);}
 const grants=await d.prepare('SELECT * FROM family_access WHERE email=? AND enabled=1 ORDER BY created').bind(email).all<any>();
 for(const g of grants.results){const p=await d.prepare("SELECT data FROM records WHERE clinic=? AND id=? AND kind='patient'").bind(g.clinic,g.clinic+':'+g.patient_id).first<any>();if(p&&eligiblePatient({id:g.patient_id,kind:'patient',version:1,data:JSON.parse(p.data)},email))return true;}
 return false;
}
export async function setSession(s:Session){
 if(!s.access_token||!s.refresh_token)throw new Error('Invalid authentication session');
 const c=await cookies(),options={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
 c.set(accessName,s.access_token,{...options,maxAge:Math.min(s.expires_in||3600,3600)});
 c.set(refreshName,s.refresh_token,{...options,maxAge:60*60*24*30});
}
export async function clearSession(){const c=await cookies();c.delete(accessName);c.delete(refreshName);}
export async function verifiedUser(token:string):Promise<User|null>{
 const r=await authRequest('user',undefined,token);if(r.status===401||r.status===403)return null;if(!r.ok)throw new Error('Authentication unavailable');
 const u=await r.json() as any;if(!u.id||!u.email||!u.email_confirmed_at)return null;
 let claims:any;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{return null;}
 if(!/^[\da-f-]{36}$/i.test(claims.session_id||''))return null;
 const active=await database().prepare('SELECT id FROM auth.sessions WHERE id=? AND user_id=? AND (not_after IS NULL OR not_after>now())').bind(claims.session_id,u.id).first();
 if(!active)return null;
 return {userId:u.id,email:emailValue(u.email),displayName:typeof u.user_metadata?.name==='string'?u.user_metadata.name.slice(0,150):u.email};
}
export async function currentUser():Promise<User|null>{
 const c=await cookies(),token=c.get(accessName)?.value;
 let user=token?await verifiedUser(token):null;
 if(!user&&c.get(refreshName)?.value){const r=await authRequest('token?grant_type=refresh_token',{refresh_token:c.get(refreshName)!.value});if(r.ok){const s=await r.json() as Session;user=await verifiedUser(s.access_token);if(user){try{await setSession(s);}catch{/* A page render cannot set cookies. APIs refresh them on the next request. */}}}}
 return user;
}
export async function signOut(){const token=(await cookies()).get(accessName)?.value;try{if(token)await authRequest('logout?scope=local',{},token);}finally{await clearSession();}}
export const returnPath=(v:unknown)=>typeof v==='string'&&/^\/(?:\?|$)/.test(v)||v==='/pais'?String(v):'/';
export async function landingPath(user:User,next:unknown){if(user.email===emailValue(publicConfig().CLINIC_OWNER_EMAIL||''))return returnPath(next);const member=await database().prepare('SELECT * FROM memberships WHERE email=?').bind(user.email).first();return member?returnPath(next):'/pais';}
