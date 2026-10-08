import {db,AppError,Identity,allRecords} from './server';
import type {Rec} from './model';
import type {Statement} from './supabase-database';
import {preparation,lisbonNow,nextDay,attendanceNoticeChanges} from './care';
import {prepareMail} from './mail-server';
export {mailReady} from './mail-server';
export function insertRecord(a:Identity,r:Rec,guard?:{id:string;op:string}){const now=new Date().toISOString();return db().prepare(`INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? ${guard?"WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)":''}`).bind(a.tenant+':'+r.id,a.tenant,r.kind,JSON.stringify(r.data),a.user.userId,now,...(guard?[a.tenant+':'+guard.id,guard.op]:[]))}
export function notification(id:string,data:any):Rec{return {id,kind:'careNotice',version:0,data:{...data,createdAt:new Date().toISOString()}}}
export async function atomicSave(a:Identity,r:Rec,prev:Rec|undefined,extras:(guard:{id:string;op:string})=>Statement[]=()=>[],dependencies:{id:string;version:number}[]=[]){
 const op=crypto.randomUUID(),now=new Date().toISOString();r.data.mutationId=op;
 const checks=dependencies.map(()=>" AND EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?)").join('');const args=dependencies.flatMap(d=>[a.tenant+':'+d.id,a.tenant,d.version]);
 const primary=prev?db().prepare('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?'+checks).bind(JSON.stringify(r.data),now,a.tenant+':'+r.id,a.tenant,r.version,...args):db().prepare('INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? WHERE 1=1'+checks).bind(a.tenant+':'+r.id,a.tenant,r.kind,JSON.stringify(r.data),a.user.userId,now,...args);
 const guard={id:r.id,op};const audit=db().prepare("INSERT INTO audit(id,clinic,actor,action,record_id,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)").bind(op,a.tenant,a.user.userId,prev?'care-update':'care-create',a.tenant+':'+r.id,now,a.tenant+':'+r.id,op);
 const result=await db().batch([primary,...extras(guard),audit]);if(!result[0].meta.changes)throw new AppError('O registo mudou entretanto. Atualize antes de guardar; o texto foi preservado.',409);
 return {...r,version:(prev?.version||0)+1};
}
export async function runClinic(a:Identity,options:{preparationOnly?:boolean}={}){const rows=await allRecords(a),today=lisbonNow(),tomorrow=nextDay(today.date);const statements:Statement[]=[];
 for(const ap of rows.filter(r=>r.kind==='appointment'&&r.data.date===tomorrow&&!['Cancelada','Falta','Concluída','Remarcada'].includes(r.data.status))){const prep=preparation(rows,ap);const note=notification('brief-'+ap.id+'-'+tomorrow,{name:'Preparação da próxima sessão',patientId:ap.data.patientId,therapist:ap.data.therapist,appointmentId:ap.id,type:'brief',date:tomorrow,body:prep.body});const previous=rows.find(r=>r.id===note.id);if(!previous)statements.push(insertRecord(a,note));else if(previous.data.body!==prep.body||previous.data.therapist!==ap.data.therapist)statements.push(db().prepare('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?').bind(JSON.stringify({...previous.data,...note.data,createdAt:previous.data.createdAt||note.data.createdAt}),new Date().toISOString(),a.tenant+':'+note.id,a.tenant,previous.version));}
 for(const note of options.preparationOnly?[]:attendanceNoticeChanges(rows,today)){const previous=rows.find(r=>r.id===note.id);if(!previous)statements.push(insertRecord(a,note));else statements.push(db().prepare('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?').bind(JSON.stringify(note.data),new Date().toISOString(),a.tenant+':'+note.id,a.tenant,previous.version));}
 for(let i=0;i<statements.length;i+=50)await db().batch(statements.slice(i,i+50));
 return {prepared:statements.length};
}
export async function sendDelivery(a:Identity,delivery:Rec,patient:Rec){
 const mail=await prepareMail(a);
 const lock=await db().prepare("UPDATE records SET data=json_set(data,'$.status','A enviar'),version=version+1 WHERE id=? AND clinic=? AND json_extract(data,'$.status')='Preparado' AND EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?)").bind(a.tenant+':'+delivery.id,a.tenant,a.tenant+':'+patient.id,a.tenant,patient.version).run();
 if(!lock.meta.changes)throw new AppError('Este envio já foi processado. Consulte o histórico.',409);
 const {status,providerId,provider}=await mail.send({to:delivery.data.recipient,subject:'Sumário de acompanhamento',text:delivery.data.body,id:a.tenant+'/'+delivery.id});
 const now=new Date().toISOString();await db().batch([db().prepare("UPDATE records SET data=json_set(data,'$.status',?,'$.providerId',?,'$.provider',?,'$.processedAt',?),version=version+1,updated=? WHERE id=? AND clinic=?").bind(status,providerId,provider,now,now,a.tenant+':'+delivery.id,a.tenant),insertRecord(a,notification('sent-'+delivery.id,{name:'Partilha do sumário: '+status,patientId:delivery.data.patientId,directorOnly:true,type:'delivery',body:'Destinatário: '+delivery.data.recipient+'. Consulte o histórico de partilhas. Aceitação pelo serviço não confirma entrega.',deliveryId:delivery.id}))]);
 return status;
}
