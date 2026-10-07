import type {Rec} from './model';

const preservedPlanStates = ['Aprovado', 'Ativo', 'Concluído', 'Arquivado', 'Substituído'];

// The saved version determines editability, never an unsaved select value.
export function planIsLocked(saved?: Rec) {
  return Boolean(saved && preservedPlanStates.includes(saved.data.status));
}

const key = (goal: any) => goal.planId + ':' + goal.goalId;
export function reconcileDraftGoals(rows: Rec[], patientId: string, saved: any[] = []) {
  const available = rows.filter(r => r.kind === 'plan' && r.data.patientId === patientId && ['Ativo', 'Aprovado'].includes(r.data.status))
    .flatMap(plan => (plan.data.goals || []).map((g: any) => ({planId: plan.id, goalId: g.id, goalName: g.name, criteria: g.criteria || '', observed: false, correct: 0, attempts: 0, help: 0, note: '', historicalGoal: false, saved: false})));
  const current = new Map(available.map((g: any) => [key(g), g]));
  const existing = new Set(saved.map(key));
  return [...saved.map(g => ({...g, saved: true, historicalGoal: !current.has(key(g))})), ...available.filter((g: any) => !existing.has(key(g)))];
}

// Empty newly offered goals are UI options, not observations. Always send previously
// saved rows, including intentionally cleared measurements, and retain every note.
export function sessionGoalPayload(goals: any[]) {
  return goals.filter(g => g.saved || g.observed || g.correct || g.attempts || g.help || String(g.note || '').trim())
    .map(({planId, goalId, observed, correct, attempts, help, note}) => ({planId, goalId, observed, correct, attempts, help, note}));
}
