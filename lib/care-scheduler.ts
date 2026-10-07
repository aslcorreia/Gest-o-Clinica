import {env} from 'cloudflare:workers';
import {allRecords,db,type Identity} from './server';
import {insertRecord,mailReady,notification,runClinic} from './care-server';
import {lisbonNow,nextDay} from './care';
import type {Rec} from './model';

const APP_URL='https://gest-o-clinica.as-lcorreia.workers.dev/#preparation';
export const preparationScheduleDue=(at=new Date())=>lisbonNow(at).time.slice(0,2)==='18';
export const preparationEmailEnabled=()=>String((env as any).CARE_TEAM_EMAIL_ENABLED)==='true'&&mailReady();
type VerifiedMember={therapist:string;email:string};

// A profile email alone is insufficient: the exact address must have an enabled
// professional membership and a recorded first authenticated access.
export function preparationRecipients(rows:Rec[],members:VerifiedMember[],date:string){
 const scheduled=new Set(rows.filter(r=>r.kind==='appointment'&&r.data.date===date&&!['Cancelada','Falta','Concluída','Remarcada'].includes(r.data.status)).map(r=>r.data.therapist));
 return rows.filter(r=>r.kind==='team'&&r.data.status==='Ativo'&&r.data.preparationEmail==='Sim'&&scheduled.has(r.id)).flatMap(t=>{
  const email=String(t.data.email||'').trim().toLowerCase();
  const member=members.find(m=>m.therapist===t.id&&m.email.trim().toLowerCase()===email);
  return member&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?[{therapist:t.id,email}]:[];
 });
}

async function updateNotice(a:Identity,id:string,patch:Record<string,unknown>){
 await db().prepare('UPDATE records SET data=json_set(data,\'$.status\',?,\'$.body\',?,\'$.finishedAt\',?),version=version+1,updated=? WHERE id=? AND clinic=?').bind(patch.status,patch.body,patch.finishedAt,patch.finishedAt,a.tenant+':'+id,a.tenant).run();
}

async function notifyTherapists(a:Identity,date:string){
 if(!preparationEmailEnabled())return {accepted:0,failed:0,enabled:false};
 const rows=await allRecords(a);
 const members=await db().prepare("SELECT m.therapist,m.email FROM memberships m WHERE m.clinic=? AND m.enabled=1 AND EXISTS(SELECT 1 FROM audit a WHERE a.id='first-access:'||m.id AND a.clinic=m.clinic AND a.action='first_professional_access')").bind(a.tenant).all<VerifiedMember>();
 let accepted=0,failed=0;
 for(const recipient of preparationRecipients(rows,members.results,date)){
  const id='preparation-email-'+date+'-'+recipient.therapist;
  const note=notification(id,{name:'Aviso de preparação por email',directorOnly:true,type:'preparationEmail',therapist:recipient.therapist,date,recipient:recipient.email,status:'A enviar',body:'Aviso de disponibilidade da preparação. O email não contém dados clínicos.'});
  // The immutable daily claim prevents duplicate sends, including concurrent
  // native/external scheduler runs and a retry after a provider timeout.
  if(!(await insertRecord(a,note).run()).meta.changes)continue;
  let status='Resultado desconhecido';
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+(env as any).RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':a.tenant+'/'+id},body:JSON.stringify({from:(env as any).MAIL_FROM,to:[recipient.email],subject:'Bem Crescer — preparação das próximas sessões',text:'As preparações das suas sessões de '+date+' estão disponíveis na Bem Crescer. Entre na sua área profissional para consultar os objetivos, o trabalho anterior e as orientações para a próxima sessão.\n\n'+APP_URL}),signal:AbortSignal.timeout(15000)});
   const result:any=await response.json();
   status=response.ok&&result.id?'Aceite pelo serviço':'Falhou';
  }catch{status='Resultado desconhecido'}
  const finishedAt=new Date().toISOString();
  await updateNotice(a,id,{status,finishedAt,body:'Destinatário: '+recipient.email+'. Estado: '+status+'. O aviso contém apenas a ligação à área profissional. Aceitação pelo serviço não confirma entrega.'});
  if(status==='Aceite pelo serviço')accepted++;else failed++;
 }
 return {accepted,failed,enabled:true};
}

export async function runScheduledPreparations(at=new Date(),source:'cloudflare'|'external'='cloudflare'){
 if(source==='cloudflare'&&!preparationScheduleDue(at))return {skipped:true,clinics:0,prepared:0,failed:0};
 const date=lisbonNow(at).date,tomorrow=nextDay(date);
 const clinics=await db().prepare('SELECT id,owner FROM clinics').all<{id:string;owner:string}>();
 let prepared=0,failed=0,processed=0;
 for(const clinic of clinics.results){
  const a={tenant:clinic.id,role:'director',owner:true,therapist:'',user:{userId:clinic.owner}} as Identity;
  const id='preparation-scheduler-'+date;
  const note=notification(id,{name:'Preparação automática — '+date,directorOnly:true,type:'scheduler',date,source,status:'Em curso',startedAt:new Date().toISOString(),body:'A preparar os avisos internos das sessões de '+tomorrow+'.'});
  try{
   const inserted=(await insertRecord(a,note).run()).meta.changes;
   // A failed preparation can be retried through the protected endpoint.
   // Email claims remain immutable so a retry never repeats a possibly sent email.
   if(!inserted){
    const retried=await db().prepare("UPDATE records SET data=json_set(data,'$.status','Em curso','$.startedAt',?,'$.finishedAt','','$.body',?),version=version+1,updated=? WHERE id=? AND clinic=? AND json_extract(data,'$.status')='Falhou'").bind(new Date().toISOString(),note.data.body,new Date().toISOString(),a.tenant+':'+id,a.tenant).run();
    if(!retried.meta.changes)continue;
   }
   processed++;
   const result=await runClinic(a,{preparationOnly:true});prepared+=result.prepared;
   const delivery=await notifyTherapists(a,tomorrow);
   await updateNotice(a,id,{status:delivery.failed?'Concluído com envios por verificar':'Concluído',finishedAt:new Date().toISOString(),body:'Preparação interna concluída para '+tomorrow+'. Avisos criados ou atualizados: '+result.prepared+'.\n'+(delivery.enabled?'Avisos por email aceites pelo serviço: '+delivery.accepted+'. Por verificar: '+delivery.failed+'. Só são elegíveis profissionais que optaram por receber email e já confirmaram o acesso.':'Avisos por email desativados ou serviço por configurar. As preparações estão disponíveis dentro da aplicação.')});
  }catch{
   failed++;
   // Log only operational state; never send clinical text to Worker logs.
   console.error('Bem Crescer: falha na preparação automática');
   try{await updateNotice(a,id,{status:'Falhou',finishedAt:new Date().toISOString(),body:'A preparação automática não foi concluída. As preparações continuam a atualizar-se ao abrir a aplicação. Verificar a configuração e os registos do agendador.'})}catch{console.error('Bem Crescer: não foi possível guardar o estado do agendador')}
  }
 }
 return {skipped:false,clinics:processed,prepared,failed};
}
