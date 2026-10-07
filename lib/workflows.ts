import {Rec} from './model';
import {Access,visible,messageVisible} from './access';
// Server-side workflow validation, deliberately separate from UI controls.
export function validateWorkflow(r:Rec,prev:Rec|undefined,rows:Rec[],a:Access){const d=r.data,fail=(s:string):never=>{throw Error(s)};
const needsPatient=['plan','report','prescription','session','assessment','document','notebook','exerciseResult','referral','autonomousSession'];

if(r.kind==='session'&&(prev?.data.careSchema||r.data.careSchema))fail('Utilize o acompanhamento para guardar este sumário.');
if(r.kind==='appointment'&&prev){const linked=rows.find(x=>x.kind==='session'&&x.data.appointmentId===r.id);if(linked&&(d.patientId!==prev.data.patientId||linked.data.status==='Concluída'&&['date','time','therapist','status'].some(k=>d[k]!==prev.data[k])))fail('Esta marcação tem um sumário associado. Preserve a identificação e o histórico da sessão.');}
if(r.kind==='plan'){
 if(d.basePlanId){const base=rows.find(x=>x.kind==='plan'&&x.id===d.basePlanId);if(!prev?.data.basePlanId||!base||base.data.patientId!==d.patientId||!visible(base,a,rows))fail('Crie a proposta a partir do plano original do paciente.');}

 if(prev&&['Aprovado','Ativo'].includes(prev.data.status))fail('Proponha uma revisão para preservar o histórico do plano aprovado.');
 if(prev?.data.status==='Substituído')fail('Plano histórico: consulte a versão atual.');
 if(d.basePlanId&&['Ativo','Aprovado','Concluído'].includes(d.status))fail('Aprove a proposta no circuito de revisão.');
 if(prev?.data.basePlanId&&(d.basePlanId!==prev.data.basePlanId||d.basePlanVersion!==prev.data.basePlanVersion))fail('A referência à versão original não pode mudar.');
 if(d.basePlanId&&d.status==='Por aprovar'&&!String(d.revisionReason||'').trim())fail('Explique o motivo da revisão.');
 for(const g of d.goals||[])if(g.targetPercent!==undefined&&(!Number.isFinite(g.targetPercent)||g.targetPercent<1||g.targetPercent>100)||g.requiredSessions!==undefined&&(!Number.isInteger(g.requiredSessions)||g.requiredSessions<1||g.requiredSessions>20))fail('Meta entre 1 e 100 e 1 a 20 sessões consecutivas.');
 if(d.context&&!['Clínica','Casa','Escola'].includes(d.context))fail('Contexto do plano inválido.');
 if(d.protocolId&&!rows.some(x=>x.id===d.protocolId&&x.kind==='material'&&x.data.category==='Protocolos'))fail('Protocolo indisponível.');
 if(d.goals!==undefined&&(!Array.isArray(d.goals)||d.goals.length>50||new Set(d.goals.map((g:any)=>g.id)).size!==d.goals.length||d.goals.some((g:any)=>!String(g.id||'').trim()||!String(g.name||'').trim()||!Number.isFinite(g.progress)||g.progress<0||g.progress>100||!['Não iniciado','Em progresso','Alcançado'].includes(g.status))))fail('Preencha os objetivos e um progresso entre 0 e 100.');
 if(a.role!=='director'&&(['Aprovado','Ativo','Concluído'].includes(d.status)||['Aprovado','Ativo','Concluído'].includes(prev?.data.status)))fail('A direção gere os planos aprovados e concluídos.');
}
if(r.kind==='autonomousSession'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Number(d.duration))||Number(d.duration)<=0||Number(d.duration)>600)fail('Data ou duração inválida.');
 for(const k of ['correct','error'])if(!Number.isInteger(d[k])||d[k]<0||d[k]>10000)fail('Contagens inválidas.');
 if(!['Concluída','Interrompida','Em curso'].includes(d.status))fail('Estado da sessão inválido.');
 if(d.prescriptionId&&!rows.some(x=>x.kind==='prescription'&&x.id===d.prescriptionId&&x.data.patientId===d.patientId))fail('A prescrição pertence a outro paciente ou está indisponível.');
 d.source='Registo manual pelo profissional';d.recordedBy=a.user.userId;
}
if(['equipmentReservation','trainingEnrollment'].includes(r.kind)){
 if(!rows.some(x=>x.kind==='team'&&x.id===d.therapist)||!/^\d{4}-\d{2}-\d{2}$/.test(d.date))fail('Responsável ou data inválidos.');
 if(a.role!=='director'&&(d.therapist!==a.therapist||prev&&prev.data.therapist!==a.therapist))fail('Só pode alterar os seus próprios registos.');
 if(r.kind==='equipmentReservation'){
  if(!rows.some(x=>x.kind==='equipment'&&x.id===d.equipmentId&&x.data.status!=='Manutenção'))fail('Equipamento indisponível.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)||!Number.isInteger(Number(d.duration))||Number(d.duration)<1||Number(d.duration)>1440||Number(d.time.slice(0,2))*60+Number(d.time.slice(3))+Number(d.duration)>1440)fail('Horário da reserva inválido.');
  if(!['Reservada','Concluída','Cancelada'].includes(d.status))fail('Estado da reserva inválido.');
 }else{
  if(!rows.some(x=>x.kind==='course'&&x.id===d.courseId)||!['Inscrito','Concluída','Cancelada'].includes(d.status))fail('Formação ou estado inválidos.');
  if(rows.some(x=>x.kind==='trainingEnrollment'&&x.id!==r.id&&x.data.courseId===d.courseId&&x.data.therapist===d.therapist))fail('Já existe uma inscrição para este profissional e formação.');
 }
}
if(['communicationTemplate','campaign','communicationRule'].includes(r.kind)){
 if(a.role!=='director')fail('Apenas a direção gere modelos, campanhas e regras.');
 if(!String(d.name||'').trim())fail('Preencha o título.');
 if(r.kind!=='communicationTemplate'&&!['Rascunho','Preparada','Arquivada'].includes(d.status))fail('Estado inválido; o envio não está configurado.');
 if(r.kind==='communicationRule'&&(!Number.isInteger(d.days)||d.days<0||d.days>365||!rows.some(x=>x.kind==='communicationTemplate'&&x.id===d.templateId)))fail('Indique o modelo e os dias entre 0 e 365.');
}
if(r.kind==='feedback'&&a.role!=='director'&&d.therapist!==a.therapist)fail('Só pode registar o seu feedback.');
if(r.kind==='team'){if(d.startTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime))fail('Hora de entrada inválida.');if(d.workDays&&!/^[0-6](,[0-6])*$/.test(d.workDays))fail('Indique os dias de 0 a 6, separados por vírgulas.');if(d.graceMinutes!==undefined&&(!Number.isFinite(d.graceMinutes)||d.graceMinutes<0||d.graceMinutes>120))fail('Tolerância entre 0 e 120 minutos.');}
if(r.kind==='patient'){
 if(d.startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)||d.endDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)||d.startDate&&d.endDate<d.startDate))fail('Datas de acompanhamento inválidas.');
 if(d.worldsProgress!==undefined&&(!Array.isArray(d.worldsProgress)||d.worldsProgress.length!==8||d.worldsProgress.some((v:any)=>v!==null&&(!Number.isFinite(v)||v<0||v>100))))fail('Indique oito valores de progresso entre 0 e 100, ou sem registo.');
 if(d.strategyItems!==undefined&&(!Array.isArray(d.strategyItems)||d.strategyItems.length>200||d.strategyItems.some((x:any)=>!String(x.id||'').trim()||!String(x.body||'').trim()||!['works','doesntWork'].includes(x.category))))fail('Estratégias inválidas.');
 if(d.currentWorld!==undefined&&d.currentWorld!==null&&(!Number.isInteger(d.currentWorld)||d.currentWorld<0||d.currentWorld>7))fail('Mundo inválido.');
 if(JSON.stringify(d.worldsProgress)!==JSON.stringify(prev?.data.worldsProgress)||d.currentWorld!==prev?.data.currentWorld){d.worldsUpdatedAt=new Date().toISOString();d.worldsUpdatedBy=a.user.userId;d.worldsSource='Registo clínico manual';}else{for(const key of ['worldsUpdatedAt','worldsUpdatedBy','worldsSource'])if(prev?.data[key]!==undefined)d[key]=prev.data[key];else delete d[key];}
}
if(needsPatient.includes(r.kind)&&!d.patientId)fail('Selecione o paciente.');
if(['wellbeing','courseProgress'].includes(r.kind)){d.therapist=a.therapist;if(prev&&prev.author!==a.user.userId)fail('Este registo é pessoal.');}
if(r.kind==='wellbeing')for(const k of ['load','satisfaction'])if(!Number.isInteger(d[k])||d[k]<1||d[k]>5)fail('A escala é de 1 a 5.');
if(r.kind==='courseProgress'){if(!rows.some(x=>x.kind==='course'&&x.id===d.courseId))fail('Formação inválida.');if(!Number.isFinite(d.progress)||d.progress<0||d.progress>100)fail('Progresso entre 0 e 100.');}
if(r.kind==='exerciseResult'){for(const k of ['correct','error','repetitions','seconds'])if(!Number.isInteger(Number(d[k]))||Number(d[k])<0)fail('Contagens e tempo devem ser inteiros não negativos.');d.source='Registo manual';if(d.prescriptionId&&!rows.some(x=>x.kind==='prescription'&&x.id===d.prescriptionId&&x.data.patientId===d.patientId))fail('Prescrição incompatível com o paciente.');}
if(r.kind==='attendance'){if(!['Entrada','Pausa','Retoma','Saída'].includes(d.type)||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time))fail('Movimento de ponto inválido.');const previous=rows.filter(x=>x.kind==='attendance'&&x.data.therapist===d.therapist&&x.data.date===d.date&&x.id!==r.id).sort((x,y)=>(y.data.recordedAt||y.data.time).localeCompare(x.data.recordedAt||x.data.time))[0];const last=previous?.data.type;if((!last||last==='Saída')&&d.type!=='Entrada'||last==='Entrada'&&!['Pausa','Saída'].includes(d.type)||last==='Pausa'&&!['Retoma','Saída'].includes(d.type)||last==='Retoma'&&!['Pausa','Saída'].includes(d.type))fail('Sequência inválida. Consulte o último movimento antes de registar.');if(previous&&d.time<previous.data.time)fail('A hora é anterior ao último movimento.');}
if(r.kind==='leave'&&d.status==='Aprovado'&&rows.some(x=>x.kind==='leave'&&x.id!==r.id&&x.data.therapist===d.therapist&&x.data.status==='Aprovado'&&x.data.date<=d.endDate&&x.data.endDate>=d.date))fail('Já existe uma ausência aprovada neste período.');
if(['plan','report','leave'].includes(r.kind)&&a.role!=='director'&&prev?.data.status==='Aprovado')fail('Um registo aprovado só pode ser alterado pela direção.');
if(['notebook','visit'].includes(r.kind)&&!rows.some(x=>x.kind==='school'&&[x.id,x.data.name].includes(d.school)))fail('Selecione uma escola válida.');
if(r.kind==='assessment'&&d.testItems){if(!Array.isArray(d.testItems)||d.testItems.some((t:any)=>!Number.isFinite(t.minutes)||t.minutes<=0||t.minutes>600))fail('Indique a duração estimada de cada prova selecionada.');}
if(r.kind==='visit'){if(!Number.isFinite(Number(d.km||0))||Number(d.km||0)<0)fail('Quilómetros inválidos.');if(d.status==='Pago'&&prev?.data.status!=='Aprovado'&&prev?.data.status!=='Pago')fail('A despesa tem de ser aprovada antes do pagamento.');if(a.role!=='director'&&prev&&['Aprovado','Pago'].includes(prev.data.status))fail('Uma deslocação aprovada só pode ser alterada pela direção.');}
if(r.kind==='document'){if(prev)fail('Documentos assinados são imutáveis. Crie um novo documento.');if(!d.accepted||!String(d.body||'').trim()||!String(d.signer||'').trim()||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||''))fail('Documento, aceitação e assinatura são obrigatórios.');}
if(r.kind==='channel'){d.members=String(d.membersText||'').split(',').map((s:string)=>s.trim()).filter(Boolean);if(d.members.some((id:string)=>!rows.some(x=>x.kind==='team'&&x.id===id)))fail('Participante desconhecido no canal.');if(d.private==='Sim'&&!d.members.length)fail('Escolha participantes para o canal privado.');}
if(r.kind==='message'){
 if(prev){if(d.react){const emoji=d.react;if(!['👍','❤️','✅'].includes(emoji))fail('Reação inválida.');const reactions={...(prev.data.reactions||{})},users:string[]=reactions[emoji]||[];reactions[emoji]=users.includes(a.user.userId)?users.filter(u=>u!==a.user.userId):[...users,a.user.userId];r.data={...prev.data,reactions};}else if(a.role==='director'&&typeof d.pinned==='boolean'){r.data={...prev.data,pinned:d.pinned};}else fail('Mensagens publicadas não podem ser alteradas.');
 }else{if(!String(d.body||'').trim()&&!d.attachment)fail('Escreva uma mensagem.');if(d.dm){if(!Array.isArray(d.members)||d.members.length!==2||!d.members.includes(a.therapist)||d.members[0]===d.members[1]||d.members.some((id:string)=>!rows.some(x=>x.kind==='team'&&x.id===id)))fail('Destinatários inválidos.');}if(!messageVisible(r,a,rows))fail('Sem acesso à conversa.');d.authorName=rows.find(x=>x.kind==='team'&&x.id===a.therapist)?.data.name||'Profissional';d.date=new Date().toISOString();d.reactions={};d.pinned=false;}
}
if(['plan','report','leave','visit'].includes(r.kind)&&d.status!==prev?.data.status&&['Aprovado','Rever','Pago'].includes(d.status)){d.reviewedBy=a.user.userId;d.reviewedAt=new Date().toISOString();}
for(const key of ['attachment','audioId','photo','certificate'])if(r.data[key]){const file=rows.find(x=>x.kind==='file'&&x.id===r.data[key]);if(!file||!visible(file,a,rows))throw Error('Anexo indisponível.');if(r.kind==='message'&&(!prev&&file.author!==a.user.userId||file.data.patientId))fail('Use um ficheiro próprio sem associação clínica para anexar ao chat.');if(file.data.patientId&&file.data.patientId!==r.data.patientId)fail('Anexo de outro paciente.');}
}
