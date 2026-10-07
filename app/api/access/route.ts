import {identity,ensureClinic,db,allRecords,checkOrigin,AppError,failure} from '@/lib/server';
import {z} from 'zod';
const profile=z.object({name:z.string().trim().min(2).max(150),specialty:z.string().trim().min(2).max(100),hours:z.number().min(0).max(60).default(35),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),workDays:z.string().regex(/^[0-6](,[0-6])*$/).default('1,2,3,4,5')});
const input=z.object({therapist:z.string().regex(/^[\w-]+$/).max(120),email:z.string().trim().email().max(254),enabled:z.boolean(),profile:profile.optional()});
export async function GET(req:Request){try{
 const a=await identity(req);if(a.role!=='director')throw new AppError('Acesso reservado à direção.',403);await ensureClinic(a);
 const members=(await db().prepare("SELECT m.email,m.therapist,m.enabled,(SELECT min(a.created) FROM audit a WHERE a.id='first-access:'||m.id) AS firstAccess FROM memberships m WHERE m.clinic=?").bind(a.tenant).all()).results;
 return Response.json({members,ownerEmail:a.user.email,ownerTherapist:a.therapist,siteAccessRequired:false},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 checkOrigin(req);const a=await identity(req);if(a.role!=='director')throw new AppError('Acesso reservado à direção.',403);await ensureClinic(a);
 const raw=await req.text();if(raw.length>8000)throw new AppError('Pedido demasiado grande.');
 const x=input.parse(JSON.parse(raw)),email=x.email.toLowerCase(),d=db();
 if(email===a.user.email.toLowerCase())throw new AppError('A sua conta já mantém a direção e a sua prática. Não a associe a outro profissional.');
 if(x.therapist==='owner-profile')throw new AppError('O perfil da direção usa a conta da proprietária. Crie um perfil próprio para a terapeuta.');
 const rows=await allRecords(a),team=rows.find(r=>r.kind==='team'&&r.id===x.therapist),existing=await d.prepare('SELECT * FROM memberships WHERE email=?').bind(email).first<any>();
 if(existing&&(existing.clinic!==a.tenant||existing.therapist!==x.therapist))throw new AppError('Este email já está associado a outro perfil. Use a conta própria deste profissional.',409);
 if(!team&&!x.profile)throw new AppError('Terapeuta não encontrado.');
 if(x.profile&&!x.enabled)throw new AppError('Crie primeiro o perfil profissional.');
 if(x.enabled&&team&&['Inativo','Arquivado'].includes(team.data.status))throw new AppError('Ative o perfil profissional antes de autorizar a conta.');
 if(existing&&!!existing.enabled===x.enabled)return Response.json({ok:true,alreadyApplied:true,siteAccessRequired:false});
 if(x.profile&&team)throw new AppError('O perfil já existe. Atualize-o na ficha do profissional.',409);
 if(!existing&&!x.enabled)throw new AppError('Não existe acesso para revogar.',404);
 const memberId=existing?.id||crypto.randomUUID(),op=crypto.randomUUID(),now=new Date().toISOString();
 let guard=existing?' AND EXISTS(SELECT 1 FROM memberships WHERE id=? AND clinic=? AND therapist=? AND enabled=?)':' AND NOT EXISTS(SELECT 1 FROM memberships WHERE email=?)';
 const args:any[]=existing?[existing.id,a.tenant,x.therapist,existing.enabled]:[email];
 if(x.enabled){guard+=' AND NOT EXISTS(SELECT 1 FROM family_access WHERE email=?) AND NOT EXISTS(SELECT 1 FROM memberships WHERE clinic=? AND therapist=? AND enabled=1 AND email<>?)';args.push(email,a.tenant,x.therapist,email);}
 if(x.profile){guard+=' AND NOT EXISTS(SELECT 1 FROM records WHERE id=?)';args.push(a.tenant+':'+x.therapist)}else{guard+=' AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)';args.push(a.tenant+':'+x.therapist,team!.version)}
 // The audit row is the transaction's authorization gate. Every mutation depends
 // on this exact operation; a rejected or racing request cannot leave partial data.
 const statements=[d.prepare('INSERT INTO audit(id,clinic,actor,action,record_id,created) SELECT ?,?,?,?,?,? WHERE 1=1'+guard).bind(op,a.tenant,a.user.userId,x.enabled?'grant_therapist':'revoke_therapist',x.therapist,now,...args)];
 if(existing)statements.push(d.prepare('UPDATE memberships SET enabled=? WHERE id=? AND clinic=? AND EXISTS(SELECT 1 FROM audit WHERE id=?)').bind(x.enabled?1:0,memberId,a.tenant,op));
 else statements.push(d.prepare('INSERT INTO memberships(id,clinic,email,therapist,enabled) SELECT ?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)').bind(memberId,a.tenant,email,x.therapist,op));
 if(x.profile)statements.push(d.prepare("INSERT INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,'team',?,?,1,? WHERE EXISTS(SELECT 1 FROM audit WHERE id=?)").bind(a.tenant+':'+x.therapist,a.tenant,JSON.stringify({...x.profile,email,status:'Ativo'}),a.user.userId,now,op));
 const result=await d.batch(statements);if(!result[0].meta.changes)throw new AppError('O acesso mudou ou este email/perfil já está associado. Atualize a lista antes de continuar.',409);
 return Response.json({ok:true,siteAccessRequired:false});
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Confirme o nome, email, especialidade e horário.'},{status:400});return failure(e)}}
