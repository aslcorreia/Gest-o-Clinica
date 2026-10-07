import type {Rec} from './model';

const text = (value:unknown) => typeof value === 'string' ? value.trim() : '';

/** Current sessions require explicit completion. A legacy SOAP without a status
 * is included only when its matching appointment confirms that it took place. */
export function isCompletedSession(record:Rec, rows:Rec[] = []) {
  if (record.kind !== 'session') return false;
  if (record.data.status) return record.data.status === 'Concluída';
  if (record.data.careSchema || !record.data.soap || !record.data.appointmentId) return false;
  return rows.some(r => r.kind === 'appointment' && r.id === record.data.appointmentId &&
    r.data.patientId === record.data.patientId && r.data.status === 'Concluída');
}

export function completedSessions(rows:Rec[], patientId?:string) {
  return rows.filter(r => (!patientId || r.data.patientId === patientId) && isCompletedSession(r, rows))
    .sort((a,b) => String(a.data.date || '').localeCompare(String(b.data.date || '')) ||
      String(a.data.time || '').localeCompare(String(b.data.time || '')) || a.id.localeCompare(b.id));
}

/** Deliberate allowlist for a professional draft, never an automatic family publication.
 * internalNote and arbitrary SOAP/object properties must not enter the report. */
export function sessionReportBody(session:Rec, rows:Rec[] = []) {
  const d = session.data;
  const sections:string[] = [];
  if (text(d.summary)) sections.push('SUMÁRIO\n' + text(d.summary));
  const soapLabels = {s:'S — Subjetivo', o:'O — Observação', a:'A — Análise', p:'P — Plano'};
  const soap = Object.entries(soapLabels).flatMap(([key,label]) => text(d.soap?.[key]) ? [label + ': ' + text(d.soap[key])] : []);
  if (soap.length) sections.push('REGISTO SOAP\n' + soap.join('\n\n'));
  if (!text(d.summary) && !soap.length) sections.push('Sumário clínico não registado.');
  if (text(d.nextSteps)) sections.push('PRÓXIMOS PASSOS\n' + text(d.nextSteps));
  if (text(d.materials)) sections.push('MATERIAIS\n' + text(d.materials));

  const goals = (Array.isArray(d.goalResults) ? d.goalResults : []).map((g:any) => {
    const name = text(g.goalName) || 'Objetivo ' + text(g.goalId);
    const attempts = Number(g.attempts), correct = Number(g.correct), help = Number(g.help);
    const measured = g.observed !== false && Number.isFinite(attempts) && attempts > 0 &&
      Number.isFinite(correct) && correct >= 0 && Number.isFinite(help) && help >= 0 && correct + help <= attempts;
    const result = measured ? `${correct}/${attempts} respostas sem ajuda (${Math.round(correct / attempts * 100)}%); ${help} com ajuda` : 'Não medido nesta sessão';
    return [name + ' — ' + result, text(g.criteria) ? 'Critério: ' + text(g.criteria) : '', text(g.note) ? 'Observação: ' + text(g.note) : ''].filter(Boolean).join('\n');
  });
  if (goals.length) sections.push('RESULTADOS POR OBJETIVO\n' + goals.join('\n\n'));

  const amendments = rows.filter(r => r.kind === 'sessionAmendment' && r.data.sessionId === session.id &&
    r.data.patientId === d.patientId && text(r.data.body)).sort((a,b) => String(a.data.date || '').localeCompare(String(b.data.date || '')));
  if (amendments.length) sections.push('ADENDAS AO REGISTO ORIGINAL\n' + amendments.map(r => `${text(r.data.date)}\n${text(r.data.body)}`).join('\n\n'));
  const total = Number(d.correct || 0) + Number(d.help || 0) + Number(d.error || 0);
  const metrics = [Number.isFinite(total) && total > 0 ? `Precisão global registada: ${Math.round(Number(d.correct || 0) / total * 100)}%` : 'Precisão global: sem medição'];
  if (Number(d.duration) > 0) metrics.push('Duração: ' + Number(d.duration) + ' min');
  sections.push(metrics.join('\n'));
  return sections.join('\n\n');
}

export function sessionReportDraft(session:Rec, rows:Rec[] = []) {
  return {patientId:session.data.patientId, name:'Sumário de sessão · ' + (session.data.date || 'Sem data'),
    type:'Sessão', body:sessionReportBody(session, rows), status:'Rascunho', recipient:'Interno', sessionId:session.id};
}

export function clinicalHistoryBody(patient:Rec, rows:Rec[], age:number|null) {
  const sessions = completedSessions(rows, patient.id);
  return [patient.data.name + ' · ' + (age === null ? 'Idade por preencher' : age + ' anos'),
    'Objetivos registados: ' + (text(patient.data.objectives) || 'Não definidos'),
    'Sessões concluídas: ' + sessions.length,
    ...sessions.map(r => `${r.data.date || 'Sem data'}\n${sessionReportBody(r, rows)}`)].join('\n\n');
}
