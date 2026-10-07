import {goalEvidence} from './care';
import type {Rec} from './model';
import {guardians,normalizeEmail,patientAge} from './patients';
export const familyTypes=['Sumário','Plano e objetivos','Orientações para casa','Documento'] as const;
export function eligiblePatient(p:Rec|undefined,email:string){return !!p&&p.kind==='patient'&&p.data.status!=='Arquivado'&&!!normalizeEmail(email)&&guardians(p.data).some(g=>g.shareAuthorized==='Sim'&&normalizeEmail(g.email)===normalizeEmail(email))}
// Deliberate allowlist: internal notes, diagnoses, raw plans and clinical files never leave this projection.
export function familyView(rows:Rec[],patientId:string,email:string){
 const p=rows.find(r=>r.id===patientId&&r.kind==='patient');if(!p)return null;
 const therapist=rows.find(r=>r.kind==='team'&&r.id===p.data.therapist);
 const publications=rows.filter(r=>r.kind==='familyPublication'&&r.data.patientId===patientId&&r.data.recipient===email&&r.data.status==='Publicado');
 const reads=rows.filter(r=>r.kind==='familyRead'&&r.data.patientId===patientId&&r.data.recipient===email);
 return {
  patient:{id:p.id,name:String(p.data.name||''),age:patientAge(p.data),guardian:guardians(p.data).find(g=>normalizeEmail(g.email)===normalizeEmail(email))?.name||'',therapist:String(therapist?.data.name||'Equipa clínica'),specialty:String(therapist?.data.specialty||''),isTest:p.data.isTest===true},
  publications:publications.map(r=>({id:r.id,type:r.data.type,title:r.data.title,body:r.data.body,date:r.data.date,hasFile:!!r.data.fileId,read:reads.some(x=>x.data.publicationId===r.id)})),
  appointments:rows.filter(r=>r.kind==='appointment'&&r.data.patientId===patientId).map(r=>({id:r.id,date:r.data.date,time:r.data.time,duration:r.data.duration,status:r.data.status,context:r.data.context,therapist:rows.find(t=>t.kind==='team'&&t.id===r.data.therapist)?.data.name||'Equipa clínica',room:rows.find(t=>t.kind==='room'&&t.id===r.data.room)?.data.name||''})).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),
  messages:rows.filter(r=>r.kind==='familyMessage'&&r.data.patientId===patientId&&r.data.recipient===email).map(r=>({id:r.id,body:r.data.body,date:r.data.date,direction:r.data.direction})).sort((a,b)=>a.date.localeCompare(b.date)),
  requests:rows.filter(r=>r.kind==='familyRequest'&&r.data.patientId===patientId&&r.data.recipient===email).map(r=>({id:r.id,appointmentId:r.data.appointmentId,type:r.data.type,body:r.data.body,date:r.data.date,status:r.data.status,response:r.data.response||''})),
 };
}
export function publicationDraft(r:Rec,rows:Rec[]=[]){
 if(r.kind==='session')return r.data.familySummary||[r.data.summary||r.data.soap?.o||'',r.data.nextSteps?'Para a próxima sessão: '+r.data.nextSteps:''].filter(Boolean).join('\n\n');
 if(r.kind==='plan')return [r.data.name,...(r.data.goals||[]).map((g:any)=>{const e=goalEvidence(rows,r,g);return [g.name,g.criteria,e.rate===null?'Ainda sem medição partilhada.':`Últimas sessões medidas: ${e.rate}% de respostas sem ajuda (até três sessões).`].filter(Boolean).join(' — ')}),r.data.body||''].filter(Boolean).join('\n\n');
 return r.kind==='report'||r.kind==='document'?String(r.data.body||''):'';
}
