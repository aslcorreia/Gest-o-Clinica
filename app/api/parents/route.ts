import {z} from 'zod';
import {currentUser} from '@/lib/auth';
import {db,bucket,checkOrigin,AppError,failure} from '@/lib/server';
import {familyView,eligiblePatient} from '@/lib/family';
import {lisbonNow} from '@/lib/care';
import type {Rec} from '@/lib/model';
async function context(req:Request){
 const user=await currentUser();if(!user)throw new AppError('Inicie sessão para abrir a área dos pais.',401);
 const grants=(await db().prepare('SELECT * FROM family_access WHERE email=? AND enabled=1 ORDER BY created').bind(user.email.toLowerCase()).all<any>()).results;
 const contexts=[];
 for(const grant of grants){const raw=await db().prepare('SELECT * FROM records WHERE clinic=?').bind(grant.clinic).all<any>();const rows:Rec[]=raw.results.map(r=>({id:r.id.slice(grant.clinic.length+1),kind:r.kind,data:JSON.parse(r.data),version:r.version,author:r.author}));const p=rows.find(r=>r.id===grant.patient_id&&r.kind==='patient');if(eligiblePatient(p,grant.email))contexts.push({grant,rows,patient:p!});}
 const requested=new URL(req.url).searchParams.get('access');const selected=requested?contexts.find(c=>c.grant.id===requested):contexts[0];
 if(requested&&!selected)throw new AppError('Acompanhamento indisponível.',403);
 return {user,contexts,selected};
}
export async function GET(req:Request){try{const c=await context(req),url=new URL(req.url),filePublication=url.searchParams.get('document');
 if(filePublication){if(!c.selected)throw new AppError('Documento indisponível.',404);const {rows,patient,grant}=c.selected;const pub=rows.find(r=>r.id===filePublication&&r.kind==='familyPublication'&&r.data.status==='Publicado'&&r.data.patientId===patient.id&&r.data.recipient===grant.email);const file=pub&&rows.find(r=>r.kind==='file'&&r.id===pub.data.fileId&&r.data.patientId===patient.id);if(!file)throw new AppError('Documento indisponível.',404);const object=await bucket().get(file.data.key);if(!object)throw new AppError('Documento indisponível.',404);return new Response(object.body,{headers:{'Content-Type':file.data.type||'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.data.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}

 return Response.json({account:{name:c.user.displayName||c.user.email,email:c.user.email},children:c.contexts.map(v=>({access:v.grant.id,name:v.patient.data.name})),access:c.selected?.grant.id||'',view:c.selected?familyView(c.selected.rows,c.selected.patient.id,c.selected.grant.email):null},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:"Dados inválidos. Reveja os campos e a confirmação."},{status:400});return failure(e)}}
export async function POST(req:Request){try{
 checkOrigin(req);const c=await context(req);if(!c.selected)throw new AppError('Sem acompanhamento autorizado.',403);const raw=await req.text();if(raw.length>25000)throw new AppError('Texto demasiado longo.');const x=JSON.parse(raw),{rows,patient,grant}=c.selected,now=new Date().toISOString();
 const id=z.string().regex(/^[\w-]+$/).max(120).parse(x.id);let dependency:{id:string;version:number}|null=null;let kind='',data:any={patientId:patient.id,recipient:grant.email,date:now};
 if(x.action==='message'){kind='familyMessage';data={...data,body:z.string().trim().min(1).max(6000).parse(x.body),direction:'parent'};}
 else if(x.action==='request'){
  const ap=rows.find(r=>r.id===x.appointmentId&&r.kind==='appointment'&&r.data.patientId===patient.id);if(!ap||['Cancelada','Concluída','Falta'].includes(ap.data.status)||ap.data.date<lisbonNow().date)throw new AppError('Esta marcação já não permite pedidos.');
  dependency={id:ap.id,version:ap.version};kind='familyRequest';data={...data,appointmentId:ap.id,type:z.enum(['Confirmar presença','Pedir alteração','Comunicar ausência']).parse(x.type),body:z.string().trim().max(6000).parse(x.body||''),status:'Pendente'};
 }
 else if(x.action==='read'){
  const pub=rows.find(r=>r.id===x.publicationId&&r.kind==='familyPublication'&&r.data.status==='Publicado'&&r.data.patientId===patient.id&&r.data.recipient===grant.email);if(!pub)throw new AppError('Publicação indisponível.',403);dependency={id:pub.id,version:pub.version};kind='familyRead';data={...data,publicationId:pub.id};
 }else throw new AppError('Operação inválida.');
 const recordId=grant.clinic+':'+id;const mutationId=crypto.randomUUID();data.mutationId=mutationId;
 const primary=db().prepare('INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM family_access WHERE id=? AND enabled=1 AND email=?) AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)'+(dependency?' AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)':'')).bind(recordId,grant.clinic,kind,JSON.stringify(data),c.user.userId,now,grant.id,grant.email,grant.clinic+':'+patient.id,patient.version,...(dependency?[grant.clinic+':'+dependency.id,dependency.version]:[]));
 const noticeId=grant.clinic+':family-notice-'+id;
 const notice={name:kind==='familyMessage'?'Mensagem dos pais':kind==='familyRead'?'Conteúdo lido pelos pais':'Pedido dos pais: '+data.type,patientId:patient.id,therapist:patient.data.therapist,type:'family',body:'Consulte a Área dos pais.',createdAt:now,readBy:[]};
 const result=await db().batch([primary,db().prepare("INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,'careNotice',?,?,1,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)").bind(noticeId,grant.clinic,JSON.stringify(notice),c.user.userId,now,recordId,mutationId),db().prepare("INSERT OR IGNORE INTO audit(id,clinic,actor,action,record_id,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)").bind('family-'+id,grant.clinic,c.user.userId,kind,recordId,now,recordId,mutationId)]);
 if(!result[0].meta.changes)throw new AppError('O acesso ou o registo mudou. Atualize antes de tentar novamente.',409);
 return Response.json({ok:true});
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:"Dados inválidos. Reveja os campos e a confirmação."},{status:400});return failure(e)}}
