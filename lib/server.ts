import { env } from 'cloudflare:workers';
import {currentUser} from './auth';
import {database} from './supabase-database';
import {storage} from './supabase-http';
import { Rec } from './model';

import {tagExampleRecords} from './record-scope';
export function clinicOwnerEmail(){return String((env as any).CLINIC_OWNER_EMAIL||'').trim().toLowerCase()}
export const db=database;
export const bucket=storage;
export class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export async function identity(req: Request) {
 const u=await currentUser();if(!u)throw new AppError('Inicie sessão para abrir a sua área profissional.',401);
 const email=u.email.trim().toLowerCase(),d=db();

 const member=await d.prepare('SELECT * FROM memberships WHERE email=?').bind(email).first<any>();
 if(member?.enabled===0)throw new AppError('O acesso profissional desta conta foi revogado. Contacte a direção.',403);
 if(!member&&await d.prepare('SELECT clinic FROM family_access WHERE email=? LIMIT 1').bind(email).first())throw new AppError('Esta conta pertence à área dos pais. Abra /pais.',403);
 if(!member&&(!clinicOwnerEmail()||email!==clinicOwnerEmail()))throw new AppError('Esta conta ainda não foi associada à equipa. Peça à direção para autorizar o seu email profissional.',403);
 if(member){
  const profile=await d.prepare("SELECT data FROM records WHERE clinic=? AND id=? AND kind='team'").bind(member.clinic,member.clinic+':'+member.therapist).first<any>();
  if(!profile||['Inativo','Arquivado'].includes(JSON.parse(profile.data).status))throw new AppError('O perfil profissional está inativo. Contacte a direção.',403);
  await d.prepare('INSERT OR IGNORE INTO audit(id,clinic,actor,action,record_id,created) VALUES(?,?,?,?,?,?)').bind('first-access:'+member.id,member.clinic,u.userId,'first_professional_access',member.therapist,new Date().toISOString()).run();
 }
 const tenant=member?.clinic||u.userId,role=member?'therapist':'director',view=new URL(req.url).searchParams.get('view');
 const therapist=member?.therapist||'owner-profile';
 return {user:u,tenant,role:role==='director'&&view==='therapist'?'therapist':role,owner:role==='director',therapist};
}
export type Identity = Awaited<ReturnType<typeof identity>>;
export async function ensureClinic(a: Identity) {
 const d=db();if(await d.prepare('SELECT id FROM clinics WHERE id=?').bind(a.tenant).first()){await ensureOwnerProfile(a);return;}
 if(!a.owner)throw new AppError('Clínica indisponível.',403);
 const now=new Date().toISOString();
 // A new clinic starts with the owner profile and no patient examples.
 await d.batch([
  d.prepare('INSERT OR IGNORE INTO clinics(id,owner,name,created) VALUES(?,?,?,?)').bind(a.tenant,a.user.userId,'Bem Crescer',now),
  d.prepare('INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) VALUES(?,?,?,?,?,1,?)').bind(a.tenant+':'+'owner-profile',a.tenant,'team',JSON.stringify({name:a.user.displayName||'Responsável da clínica',email:a.user.email,status:'Ativo'}),a.user.userId,now)
 ]);
 await ensureOwnerProfile(a);
 
}
async function ensureOwnerProfile(a:Identity){if(!a.owner||!clinicOwnerEmail())return;await db().prepare("INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) VALUES(?,?,'team',?,?,1,?)").bind(a.tenant+':owner-profile',a.tenant,JSON.stringify({name:a.user.displayName||'Direção clínica',email:a.user.email,status:'Ativo'}),a.user.userId,new Date().toISOString()).run()}
export async function allRecords(a: Identity): Promise<Rec[]> { const r = await db().prepare('SELECT * FROM records WHERE clinic = ? ORDER BY updated DESC').bind(a.tenant).all<any>(); return tagExampleRecords(r.results.map(x => ({ id: x.id.slice(a.tenant.length + 1), kind: x.kind, data: JSON.parse(x.data), version: x.version, author: x.author }))); }
export { visible, mayWrite } from './access';
export function failure(e: unknown) { if (e instanceof AppError)
    return Response.json({ error: e.message }, { status: e.status }); console.error('Bem Crescer: operação indisponível'); return Response.json({ error: 'Não foi possível concluir. As alterações no formulário foram preservadas.' }, { status: 503 }); }
export function checkOrigin(req: Request) { const o = req.headers.get('origin'); if (o && o !== new URL(req.url).origin)
    throw new AppError('Origem não permitida.', 403); }
