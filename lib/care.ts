import type {Rec} from './model';
export const lisbonNow=(date=new Date())=>{const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);return {date:p.slice(0,10),time:p.slice(11,16)}};
export const nextDay=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export const activePlans=(rows:Rec[],patientId:string)=>rows.filter(r=>r.kind==='plan'&&r.data.patientId===patientId&&['Ativo','Aprovado'].includes(r.data.status));
export function goalEvidence(rows:Rec[],plan:Rec,goal:any){
 const lineage=new Set([plan.id]);let ancestor=plan;while(ancestor.data.basePlanId&&!lineage.has(ancestor.data.basePlanId)){const previous=rows.find(r=>r.kind==='plan'&&r.id===ancestor.data.basePlanId);const old=previous?.data.goals?.find((g:any)=>g.id===goal.id);if(!previous||!old||old.name!==goal.name||old.criteria!==goal.criteria)break;lineage.add(previous.id);ancestor=previous}
 const entries=rows.filter(r=>r.kind==='session'&&r.data.status==='Concluída'&&r.data.patientId===plan.data.patientId).flatMap(r=>(r.data.goalResults||[]).filter((g:any)=>lineage.has(g.planId)&&g.goalId===goal.id&&g.observed!==false).map((g:any)=>({date:r.data.date,sessionId:r.id,...g}))).sort((a:any,b:any)=>a.date.localeCompare(b.date)||a.sessionId.localeCompare(b.sessionId));
 const measured=entries.filter((x:any)=>Number(x.attempts)>0);const recent=measured.slice(-3);const n=recent.reduce((s:number,x:any)=>s+x.attempts,0);const rate=n?Math.round(recent.reduce((s:number,x:any)=>s+x.correct,0)/n*100):null;
 const target=Number(goal.targetPercent), required=Number(goal.requiredSessions);const configured=Number.isFinite(target)&&target>0&&target<=100&&Number.isInteger(required)&&required>0;const met=configured&&measured.length>=required&&measured.slice(-required).every((g:any)=>g.correct/g.attempts*100>=target);
 const falling=measured.length>=3&&measured.slice(-3).every((g:any,i:number,a:any[])=>i===0||g.correct/g.attempts<a[i-1].correct/a[i-1].attempts);
 return {entries,rate,met,suggestion:!configured?'Definir o critério quantitativo da meta com a terapeuta.':met?'Critério atingido nas sessões exigidas: validar aquisição e próximo objetivo.':falling?'Desempenho em descida nas últimas três medições: rever estratégias e condições.':entries.length?'Manter observação e comparar nas mesmas condições.':'Recolher uma observação inicial deste objetivo.'};
}
export function preparation(rows:Rec[],appointment:Rec){
 const patient=rows.find(r=>r.id===appointment.data.patientId&&r.kind==='patient');
 const sessions=rows.filter(r=>r.kind==='session'&&r.data.patientId===appointment.data.patientId&&r.data.status==='Concluída'&&r.data.date<=appointment.data.date).sort((a,b)=>b.data.date.localeCompare(a.data.date)).slice(0,3);
 const plans=activePlans(rows,appointment.data.patientId);
 const observations=rows.filter(r=>r.data.patientId===appointment.data.patientId&&(r.kind==='communication'&&r.data.type==='Informação da família'||r.kind==='familyMessage'&&r.data.direction==='parent')).sort((a,b)=>String(b.data.date||'').localeCompare(String(a.data.date||''))).slice(0,3);
 return {patient,plans,sessions,body:[`${patient?.data.name||'Paciente'} · ${appointment.data.date} às ${appointment.data.time}`,'OBJETIVOS ATIVOS',...plans.flatMap(p=>(p.data.goals||[]).map((g:any)=>`${g.name} — ${g.criteria||'Critério por definir'}\n${goalEvidence(rows,p,g).suggestion}`)),plans.length?'':'Sem plano ativo: definir ou aprovar o plano.', 'ÚLTIMAS SESSÕES',...sessions.map(s=>`${s.data.date}: ${s.data.summary||s.data.soap?.o||'Sem sumário'}\nPróximo passo registado: ${s.data.nextSteps||s.data.soap?.p||'Não registado'}\nMateriais: ${s.data.materials||'Não indicados'}`),sessions.length?'':'Sem sessões anteriores registadas.','ADENDAS',...rows.filter(r=>r.kind==='sessionAmendment'&&sessions.some(s=>s.id===r.data.sessionId)).map(r=>r.data.date+': '+r.data.body),'ESTRATÉGIAS REGISTADAS',...(patient?.data.strategyItems||[]).filter((s:any)=>!s.archived).map((s:any)=>`${s.category==='works'?'Funciona':'Evitar / rever'}: ${s.body}`),'INFORMAÇÃO DA FAMÍLIA',...observations.map(r=>r.data.body),'Fontes: '+[...sessions,...plans,...observations].map(r=>r.kind+' '+r.id+' (v'+r.version+')').join(', ')].filter(Boolean).join('\n\n')};
}
export function presence(rows:Rec[],therapist:string,date=lisbonNow().date){const last=rows.filter(r=>r.kind==='attendance'&&r.data.therapist===therapist&&r.data.date===date).sort((a,b)=>(b.data.recordedAt||b.data.time).localeCompare(a.data.recordedAt||a.data.time))[0];return !last?'Sem check-in':last.data.type==='Saída'?'Saiu':last.data.type==='Pausa'?'Em pausa':'Presente'}
/** Explicit zero is a configured reference; an empty contract has no implied workload. */
export function monthlyReferenceHours(data:Record<string,any>|undefined):number|null {
 const parse=(value:any)=>value===undefined||value===null||String(value).trim()===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
 const monthly=parse(data?.monthlyHours);return monthly!==null?monthly:(parse(data?.hours)===null?null:parse(data?.hours)!*4.33);
}
export function visitTransitionData(data:Record<string,any>,previous:Record<string,any>|undefined,at=new Date().toISOString()) {
 const next={...data};
 // Workflow timestamps belong to their event, not to later edits or financial approval.
 for(const field of ['departedAt','checkin','checkout','approvedAt','paidAt']){
  if(previous?.[field]!==undefined)next[field]=previous[field];else delete next[field];
 }
 if(previous?.status!==data.status){
  const field:Record<string,string>={'A caminho':'departedAt','Na escola':'checkin','Concluído':'checkout','Aprovado':'approvedAt','Pago':'paidAt'};
  const key=field[data.status];if(key&&!next[key])next[key]=at;
 }
 return next;
}
export function attendanceIssues(rows:Rec[],now=lisbonNow()){
 return rows.filter(r=>r.kind==='team'&&r.data.status==='Ativo'&&!r.data.archived).flatMap(t=>{
  const absent=rows.some(r=>r.kind==='leave'&&r.data.therapist===t.id&&r.data.status==='Aprovado'&&r.data.date<=now.date&&r.data.endDate>=now.date);
  if(absent)return [];
  const ap=rows.filter(r=>r.kind==='appointment'&&r.data.therapist===t.id&&r.data.date===now.date&&!['Cancelada','Falta'].includes(r.data.status)).sort((a,b)=>a.data.time.localeCompare(b.data.time));
  const weekday=new Date(now.date+'T12:00:00Z').getUTCDay();
  const scheduled=(String(t.data.workDays||'1,2,3,4,5').split(',').map(x=>x.trim()).includes(String(weekday))?t.data.startTime:'')||ap[0]?.data.time;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduled||''))return [];
  const grace=Number(t.data.graceMinutes??10),limit=Number(scheduled.slice(0,2))*60+Number(scheduled.slice(3))+(Number.isFinite(grace)&&grace>=0?grace:10);
  const m=Number(now.time.slice(0,2))*60+Number(now.time.slice(3));
  const first=rows.filter(r=>r.kind==='attendance'&&r.data.therapist===t.id&&r.data.date===now.date&&r.data.type==='Entrada').sort((a,b)=>a.data.time.localeCompare(b.data.time))[0];
  const late=first&&(Number(first.data.time.slice(0,2))*60+Number(first.data.time.slice(3))>limit);
  return !first&&m>limit||late?[{id:`attendance-${t.id}-${now.date}`,date:now.date,therapist:t.id,title:`${t.data.name}: ${first?'entrada com atraso':'check-in por confirmar'}`,detail:`Previsto ${scheduled}. ${first?'Entrada '+first.data.time:'Sem entrada registada; confirmar com a terapeuta.'}`}]:[];
 });
}
/** Idempotent notice reconciliation keeps the original creation time, readers and prior states. */
export function attendanceNoticeChanges(rows:Rec[],now=lisbonNow(),at=new Date().toISOString()):Rec[]{
 const issues=attendanceIssues(rows,now),byId=new Map(issues.map(issue=>[issue.id,issue]));
 const previous=rows.filter(r=>r.kind==='careNotice'&&r.data.type==='attendance'&&(r.data.date||r.id.slice(-10))===now.date);
 const changes:Rec[]=[];
 for(const issue of issues){
  const old=previous.find(r=>r.id===issue.id);
  const data={...(old?.data||{}),name:issue.title,body:issue.detail,date:now.date,therapist:issue.therapist,directorOnly:true,type:'attendance',status:'Por verificar'};
  if(old&&old.data.name===data.name&&old.data.body===data.body&&old.data.status===data.status)continue;
  changes.push({id:issue.id,kind:'careNotice',version:old?.version||0,data:{...data,createdAt:old?.data.createdAt||at,updatedAt:at,resolvedAt:'',history:old?[...(old.data.history||[]),{name:old.data.name,body:old.data.body,status:old.data.status||'Por verificar',changedAt:at}] : []}});
 }
 for(const old of previous){
  if(byId.has(old.id)||old.data.status==='Resolvido')continue;
  const person=rows.find(r=>r.kind==='team'&&r.id===old.data.therapist);
  const entrance=rows.filter(r=>r.kind==='attendance'&&r.data.therapist===old.data.therapist&&r.data.date===now.date&&r.data.type==='Entrada').sort((a,b)=>a.data.time.localeCompare(b.data.time))[0];
  const absent=rows.some(r=>r.kind==='leave'&&r.data.therapist===old.data.therapist&&r.data.status==='Aprovado'&&r.data.date<=now.date&&r.data.endDate>=now.date);
  const reason=entrance?`Entrada registada às ${entrance.data.time}.`:absent?'Ausência aprovada para este dia.':!person||person.data.status!=='Ativo'||person.data.archived?'Profissional sem atividade prevista.':'Sem check-in em falta face ao horário atual.';
  changes.push({...old,data:{...old.data,name:`${person?.data.name||'Profissional'}: check-in resolvido`,body:reason,date:now.date,status:'Resolvido',resolvedAt:at,updatedAt:at,history:[...(old.data.history||[]),{name:old.data.name,body:old.data.body,status:old.data.status||'Por verificar',changedAt:at}]}});
 }
 // A check-in can arrive just before midnight and be reconciled only on the next visit.
 for(const old of rows.filter(r=>r.kind==='careNotice'&&r.data.type==='attendance'&&(r.data.date||r.id.slice(-10))<now.date&&r.data.status!=='Resolvido')){
  const date=old.data.date||old.id.slice(-10);
  const entrance=rows.filter(r=>r.kind==='attendance'&&r.data.therapist===old.data.therapist&&r.data.date===date&&r.data.type==='Entrada').sort((a,b)=>a.data.time.localeCompare(b.data.time))[0];
  const absent=rows.some(r=>r.kind==='leave'&&r.data.therapist===old.data.therapist&&r.data.status==='Aprovado'&&r.data.date<=date&&r.data.endDate>=date);
  if(!absent&&(!entrance||!String(old.data.body||'').includes('Sem entrada registada')))continue;
  const person=rows.find(r=>r.kind==='team'&&r.id===old.data.therapist);
  const name=`${person?.data.name||'Profissional'}: ${absent?'check-in resolvido':'entrada registada — conferir horário'}`;
  const body=absent?`Ausência aprovada para ${date}.`:`Entrada registada às ${entrance!.data.time} em ${date}. Conferir o horário previsto no alerta original.`;
  changes.push({...old,data:{...old.data,name,body,date,status:absent?'Resolvido':'Por verificar',updatedAt:at,...(absent?{resolvedAt:at}:{}),history:[...(old.data.history||[]),{name:old.data.name,body:old.data.body,status:old.data.status||'Por verificar',changedAt:at}]}});
 }
 return changes;
}
export function careTasks(rows:Rec[],date=lisbonNow().date){return [
 ...rows.filter(r=>r.kind==='appointment'&&r.data.date<=date&&r.data.status==='Concluída'&&!rows.some(s=>s.kind==='session'&&s.data.appointmentId===r.id&&s.data.status==='Concluída')).map(r=>({id:r.id,patientId:r.data.patientId,title:'Sumário por concluir',detail:r.data.date+' · '+r.data.time})),
 ...rows.filter(r=>r.kind==='session'&&r.data.status==='Rascunho').map(r=>({id:r.id,patientId:r.data.patientId,title:'Sumário em rascunho',detail:r.data.date})),
 ...rows.filter(r=>r.kind==='plan'&&['Aprovado','Ativo'].includes(r.data.status)&&r.data.reviewDate&&r.data.reviewDate<=date).map(r=>({id:r.id,patientId:r.data.patientId,title:'Plano por rever',detail:r.data.name})),
 ...rows.filter(r=>r.kind==='delivery'&&['Falhou','Por configurar','Resultado desconhecido'].includes(r.data.status)).map(r=>({id:r.id,patientId:r.data.patientId,title:'Partilha por verificar',detail:r.data.status})),
 ...rows.filter(r=>r.kind==='plan'&&r.data.basePlanId&&r.data.status==='Por aprovar').map(r=>({id:r.id,patientId:r.data.patientId,title:'Proposta de alteração',detail:r.data.name}))
]}
