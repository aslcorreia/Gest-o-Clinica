import {z} from 'zod';
import {identity,ensureClinic,allRecords,visible,db,checkOrigin,AppError,failure} from '@/lib/server';
import {atomicSave,insertRecord,notification} from '@/lib/care-server';
import {eligiblePatient,familyTypes,familyView} from '@/lib/family';
import type {Rec} from '@/lib/model';
const token=z.string().regex(/^[\w-]+$/).max(120),body=z.string().trim().min(1).max(20000);
export async function GET(req:Request){try{const a=await identity(req);await ensureClinic(a);const rows=await allRecords(a);const patientId=new URL(req.url).searchParams.get('patientId');const p=rows.find(r=>r.kind==='patient'&&r.id===patientId&&visible(r,a,rows));if(!p)throw new AppError('Selecione um paciente autorizado.',403);const grants=await db().prepare('SELECT id,email,enabled FROM family_access WHERE clinic=? AND patient_id=?').bind(a.tenant,p.id).all();const email=String(p.data.guardianEmail||'').trim().toLowerCase();return Response.json({grants:grants.results,preview:familyView(rows,p.id,email)},{headers:{'Cache-Control':'no-store'}})}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:"Dados inválidos. Reveja os campos e a confirmação."},{status:400});return failure(e)}}
export async function POST(req:Request){try{
 checkOrigin(req);const a=await identity(req);await ensureClinic(a);const raw=await req.text();if(raw.length>60000)throw new AppError('Texto demasiado longo.');const x=JSON.parse(raw),rows=await allRecords(a),p=rows.find(r=>r.kind==='patient'&&r.id===x.patientId&&visible(r,a,rows));if(!p)throw new AppError('Paciente indisponível.',403);
 const email=String(x.recipient??p.data.guardianEmail??'').trim().toLowerCase(),now=new Date().toISOString();
 const notice=(id:string,name:string)=>notification('family-'+id,{patientId:p.id,therapist:p.data.therapist,name,body:'Consulte a Área dos pais deste paciente.',type:'family'});
 if(x.action==='grant'){
  if(a.role!=='director')throw new AppError('A direção gere os acessos dos pais.',403);const enabled=z.boolean().parse(x.enabled);
  const recipient=z.string().email().parse(x.email).trim().toLowerCase();
  if(enabled&&(!eligiblePatient(p,recipient)||recipient===a.user.email.toLowerCase()))throw new AppError('Confirme o email do responsável e a autorização de partilha na ficha.');
  if(enabled&&await db().prepare('SELECT id FROM memberships WHERE email=?').bind(recipient).first())throw new AppError('Use uma conta de responsável diferente da conta profissional.');
  const grantId=crypto.randomUUID();
  const result=await db().batch([db().prepare('INSERT INTO family_access(id,clinic,patient_id,email,enabled,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?) ON CONFLICT(clinic,patient_id,email) DO UPDATE SET enabled=excluded.enabled').bind(grantId,a.tenant,p.id,recipient,enabled?1:0,now,a.tenant+':'+p.id,a.tenant,p.version),db().prepare('INSERT INTO audit(id,clinic,actor,action,record_id,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?)').bind(crypto.randomUUID(),a.tenant,a.user.userId,enabled?'grant_parent':'revoke_parent',p.id,now,a.tenant+':'+p.id,a.tenant,p.version)]);if(!result[0].meta.changes)throw new AppError('A ficha mudou. Atualize antes de gerir acessos.',409);
  return Response.json({ok:true});
 }
 if(x.action==='publish'){
  if(!eligiblePatient(p,email))throw new AppError('Confirme o responsável e a autorização de partilha na ficha.');
  const data=z.object({id:token,type:z.enum(familyTypes),title:z.string().trim().min(1).max(160),body,confirmed:z.literal(true),sourceId:token.optional(),sourceVersion:z.number().int().positive().optional(),fileId:token.optional()}).parse(x);
  const dependencies=[{id:p.id,version:p.version}];
  if(data.sourceId){const src=rows.find(r=>r.id===data.sourceId&&r.data.patientId===p.id&&visible(r,a,rows));if(!src||!['session','plan','report','document'].includes(src.kind))throw new AppError('Origem inválida.');if(src.version!==data.sourceVersion)throw new AppError('A origem mudou. Reabra e reveja o texto.',409);if(src.kind==='session'&&src.data.status!=='Concluída'||src.kind==='plan'&&!['Ativo','Aprovado'].includes(src.data.status))throw new AppError('Publique apenas sessões concluídas ou planos aprovados.');dependencies.push({id:src.id,version:src.version});}
  if(data.fileId){const file=rows.find(r=>r.id===data.fileId&&r.kind==='file'&&r.data.patientId===p.id&&visible(r,a,rows));if(!file)throw new AppError('Anexo indisponível.',403);dependencies.push({id:file.id,version:file.version});}
  const r:Rec={id:data.id,kind:'familyPublication',version:0,data:{patientId:p.id,recipient:email,type:data.type,title:data.title,body:data.body,fileId:data.fileId||'',sourceId:data.sourceId||'',sourceVersion:data.sourceVersion||0,date:now,status:'Publicado',reviewedBy:a.user.userId}};
  await atomicSave(a,r,undefined,g=>[insertRecord(a,notice(r.id,'Novo conteúdo publicado para os pais'),g)],dependencies);return Response.json({ok:true});
 }
 if(x.action==='withdraw'){
  const r=rows.find(r=>r.id===x.id&&r.kind==='familyPublication'&&r.data.patientId===p.id);if(!r)throw new AppError('Publicação indisponível.');await atomicSave(a,{...r,data:{...r.data,status:'Retirado',withdrawnAt:now}},r,g=>[insertRecord(a,notice('withdraw-'+r.id,'Conteúdo retirado da área dos pais'),g)]);return Response.json({ok:true});
 }
 if(x.action==='message'){
  if(!eligiblePatient(p,email))throw new AppError('Confirme a autorização de partilha.');const id=token.parse(x.id);await atomicSave(a,{id,kind:'familyMessage',version:0,data:{patientId:p.id,recipient:email,body:body.parse(x.body),date:now,direction:'clinic'}},undefined,g=>[insertRecord(a,notice(id,'Mensagem enviada aos pais'),g)],[{id:p.id,version:p.version}]);return Response.json({ok:true});
 }
 if(x.action==='resolve'){
  const r=rows.find(r=>r.id===x.id&&r.kind==='familyRequest'&&r.data.patientId===p.id);if(!r||r.data.status!=='Pendente')throw new AppError('Pedido já tratado ou indisponível.');await atomicSave(a,{...r,data:{...r.data,status:'Respondido',response:body.parse(x.response),respondedAt:now}},r);return Response.json({ok:true});
 }
 throw new AppError('Operação inválida.');
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:"Dados inválidos. Reveja os campos e a confirmação."},{status:400});return failure(e)}}
