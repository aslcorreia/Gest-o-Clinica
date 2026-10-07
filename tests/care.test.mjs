import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const compile=file=>ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const access=url(compile('lib/access.ts')),care=url(compile('lib/care.ts'));
const {goalEvidence,preparation,attendanceIssues,lisbonNow,nextDay}=await import(care);
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE records(id TEXT PRIMARY KEY,clinic TEXT,kind TEXT,data TEXT,author TEXT,version INTEGER,updated TEXT); CREATE TABLE audit(id TEXT PRIMARY KEY,clinic TEXT,actor TEXT,action TEXT,record_id TEXT,created TEXT)');
const d1={prepare(sql){return {bind(...values){return {async run(){const x=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(x.changes)}}},async all(){return {results:sqlite.prepare(sql).all(...values)}},async first(){return sqlite.prepare(sql).get(...values)||null}}}}} ,async batch(statements){if(this.beforeBatch){const before=this.beforeBatch;delete this.beforeBatch;before()}sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const identity={tenant:'c',role:'therapist',owner:false,therapist:'t1',user:{userId:'u1'}};
globalThis.careTest={db:d1,identity};
const server=url(`import {visible} from '${access}';export {visible};export const db=()=>globalThis.careTest.db;export const identity=async()=>globalThis.careTest.identity;export const ensureClinic=async()=>{};export class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}export function checkOrigin(req){if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new AppError('Origin',403)}export async function allRecords(a){const r=await db().prepare('SELECT * FROM records WHERE clinic=?').bind(a.tenant).all();return r.results.map(x=>({id:x.id.slice(a.tenant.length+1),kind:x.kind,data:JSON.parse(x.data),version:x.version,author:x.author}))}export function failure(e){return Response.json({error:e.message},{status:e.status||500})}`);
const env=url('export const env={}');
const careServer=url(compile('lib/care-server.ts').replace("'cloudflare:workers'",JSON.stringify(env)).replace("'./server'",JSON.stringify(server)).replace("'./care'",JSON.stringify(care)));
const calendar=url(compile('lib/calendar.ts').replace("'./scheduling'",JSON.stringify(url(compile('lib/scheduling.ts')))));
const patients=url(compile('lib/patients.ts'));const family=url(compile('lib/family.ts').replaceAll("'./calendar'",JSON.stringify(calendar)).replaceAll("'./patients'",JSON.stringify(patients)).replaceAll("'./care'",JSON.stringify(care)));
const route=url(compile('app/api/care/route.ts').replace("'cloudflare:workers'",JSON.stringify(env)).replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href)).replace("'@/lib/server'",JSON.stringify(server)).replace("'@/lib/care-server'",JSON.stringify(careServer)).replace("'@/lib/care'",JSON.stringify(care)).replace("'@/lib/family'",JSON.stringify(family)));
const {POST}=await import(route),{allRecords}=await import(server);
const put=(id,kind,data,clinic='c')=>sqlite.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,1,?)').run(clinic+':'+id,clinic,kind,JSON.stringify(data),'u1',new Date().toISOString());
const today=lisbonNow().date;
put('p','patient',{name:'Paciente teste',therapist:'t1',guardianEmail:'parent@example.invalid',shareAuthorized:'Sim'});put('other','patient',{name:'Outro',therapist:'t2'});put('t1','team',{name:'Ana',status:'Ativo',startTime:'09:00',workDays:'0,1,2,3,4,5,6'});
put('ap','appointment',{patientId:'p',therapist:'t1',date:today,time:'09:00',duration:45,status:'Esperado'});
put('plan','plan',{patientId:'p',name:'Plano',status:'Ativo',goals:[{id:'g',name:'Alvo',criteria:'Mesmo contexto',progress:0,status:'Em progresso',targetPercent:80,requiredSessions:2}]});
const invoke=async data=>{const r=await POST(new Request('https://test.invalid/api/care',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));return {status:r.status,...await r.json()}};
const base={action:'session',appointmentId:'ap',version:0,summary:'Trabalhámos o alvo.',nextSteps:'Retomar em contexto semelhante.',materials:'Cartões',familySummary:'Hoje trabalhámos o alvo.',internalNote:'NOTA INTERNA NÃO PARTILHAR',goalResults:[{planId:'plan',goalId:'g',observed:true,correct:8,help:1,attempts:10,note:'Com suporte visual'}],final:false};
let r=await invoke(base);assert.equal(r.status,200);assert.equal(r.record.version,1);
assert.equal((await invoke(base)).status,409); // stale draft
assert.equal((await invoke({...base,version:1,goalResults:[{...base.goalResults[0],correct:11}],final:true})).status,400);
r=await invoke({...base,version:1,final:true});assert.equal(r.status,200);
assert.equal((await invoke({...base,version:2,final:true})).status,400);
let rows=await allRecords(identity);assert.equal(rows.filter(r=>r.kind==='session').length,1);assert.equal(rows.find(r=>r.id==='ap').data.status,'Concluída');assert.equal(rows.filter(r=>r.kind==='careNotice').length,1);
assert.equal(goalEvidence(rows,rows.find(r=>r.id==='plan'),{id:'g',targetPercent:80,requiredSessions:2}).rate,80);
assert.equal(goalEvidence(rows,rows.find(r=>r.id==='plan'),{id:'g',targetPercent:80,requiredSessions:2}).met,false);
assert.equal((await invoke({action:'prepareDelivery',id:'delivery',sessionId:'care-ap',recipient:'wrong@example.invalid',body:'Public',confirmed:true})).status,400);
r=await invoke({action:'prepareDelivery',id:'delivery',sessionId:'care-ap',recipient:'parent@example.invalid',body:'Public',confirmed:true});assert.equal(r.status,200);assert.equal(r.record.data.body.includes('NOTA INTERNA'),false);
assert.equal((await invoke({action:'sendEmail',id:'delivery'})).status,503); // no credentials, no pretend success
assert.equal((await invoke({action:'manualShared',id:'delivery',channel:'Email manual'})).status,200);
assert.equal((await invoke({action:'manualShared',id:'delivery',channel:'Email manual'})).status,400);
assert.equal((await invoke({action:'amend',sessionId:'care-ap',id:'amend',body:'Correção identificada'})).status,200);
assert.equal((await invoke({action:'proposePlan',id:'plan',proposalId:'proposal'})).status,200);
assert.equal((await invoke({action:'approvePlan',id:'proposal',version:1,snapshotId:'snap'})).status,403);
sqlite.prepare("UPDATE records SET data=json_set(data,'$.status','Por aprovar','$.revisionReason','Objetivo revisto') WHERE id='c:proposal'").run();
identity.role='director';assert.equal((await invoke({action:'approvePlan',id:'proposal',version:1,snapshotId:'snap'})).status,200);
rows=await allRecords(identity);assert.equal(rows.find(r=>r.id==='plan').data.status,'Substituído');assert.equal(rows.find(r=>r.id==='proposal').data.status,'Ativo');assert.equal(rows.find(r=>r.kind==='planSnapshot'&&r.data.originalPlanId==='plan').data.status,'Ativo');
// A draft opened before a revision must remain editable and retain its observations.
put('draft-plan','plan',{patientId:'p',name:'Original',status:'Ativo',goals:[{id:'old-goal',name:'Objetivo anterior',criteria:'Critério original'}]});
put('draft-ap','appointment',{patientId:'p',therapist:'t1',date:today,time:'12:00',duration:45,status:'Esperado'});
const beforeRevision={...base,appointmentId:'draft-ap',summary:'Texto importante preservado',internalNote:'Nota clínica preservada',goalResults:[{planId:'draft-plan',goalId:'old-goal',observed:true,correct:4,help:1,attempts:6,note:'Observação histórica'}]};
assert.equal((await invoke(beforeRevision)).status,200);
assert.equal((await invoke({action:'proposePlan',id:'draft-plan',proposalId:'draft-proposal'})).status,200);
sqlite.prepare("UPDATE records SET data=json_set(data,'$.status','Por aprovar','$.revisionReason','Novo contexto','$.goals',json(?)) WHERE id='c:draft-proposal'").run(JSON.stringify([{id:'new-goal',name:'Novo objetivo',criteria:'Critério revisto'}]));
assert.equal((await invoke({action:'approvePlan',id:'draft-proposal',version:0,snapshotId:'draft-snap'})).status,400);
assert.equal((await invoke({action:'approvePlan',id:'draft-proposal',version:2,snapshotId:'draft-snap'})).status,409);
assert.equal((await invoke({action:'approvePlan',id:'draft-proposal',version:1,snapshotId:'draft-snap'})).status,200);
r=await invoke({...beforeRevision,version:1,final:true,goalResults:[{planId:'draft-proposal',goalId:'new-goal',observed:true,correct:2,help:0,attempts:5,note:'Primeira medição no novo plano'}]});
assert.equal(r.status,200);assert.equal(r.record.data.summary,'Texto importante preservado');assert.equal(r.record.data.internalNote,'Nota clínica preservada');assert.equal(r.record.data.goalResults.length,2);
const historical=r.record.data.goalResults.find(g=>g.goalId==='old-goal');assert.equal(historical.correct,4);assert.equal(historical.note,'Observação histórica');assert.equal(historical.goalName,'Objetivo anterior');assert.equal(historical.criteria,'Critério original');assert.equal(historical.planVersion,1);assert.equal(historical.historicalGoal,true);
assert.equal(r.record.data.goalResults.find(g=>g.goalId==='new-goal').historicalGoal,false);
put('new-ap','appointment',{patientId:'p',therapist:'t1',date:today,time:'13:00',duration:45,status:'Esperado'});
assert.equal((await invoke({...beforeRevision,appointmentId:'new-ap',final:true})).status,400); // cannot introduce retired goals into a fresh session
// Closure is director-only, version-guarded, snapshotted and audited.
identity.role='therapist';assert.equal((await invoke({action:'closePlan',id:'draft-proposal',version:2,status:'Concluído',reason:'Metas revistas'})).status,403);
identity.role='director';assert.equal((await invoke({action:'closePlan',id:'draft-proposal',version:1,status:'Concluído',reason:'Metas revistas'})).status,409);
const auditBefore=sqlite.prepare("SELECT count(*) AS n FROM audit WHERE record_id='c:draft-proposal'").get().n;
r=await invoke({action:'closePlan',id:'draft-proposal',version:2,status:'Concluído',reason:'Metas alcançadas; acompanhamento revisto.'});assert.equal(r.status,200);assert.equal(r.record.data.closedBy,'u1');assert.equal(r.record.data.status,'Concluído');assert.equal(r.record.version,3);
rows=await allRecords(identity);const closure=rows.find(r=>r.kind==='planSnapshot'&&r.data.originalPlanId==='draft-proposal');assert.equal(closure.data.status,'Ativo');assert.equal(closure.data.originalPlanVersion,2);assert.equal(closure.data.goals[0].name,'Novo objetivo');assert.equal(sqlite.prepare("SELECT count(*) AS n FROM audit WHERE record_id='c:draft-proposal'").get().n,auditBefore+1);
assert.equal((await invoke({action:'closePlan',id:'draft-proposal',version:3,status:'Arquivado',reason:'Não repetir'})).status,400);
put('archive-plan','plan',{patientId:'p',name:'Plano a arquivar',status:'Aprovado',goals:[]});assert.equal((await invoke({action:'closePlan',id:'archive-plan',version:1,status:'Arquivado',reason:'Mudança de contexto'})).status,200);
// Several active plans may collectively contain more than 50 measured objectives.
const manyGoals=[];for(let plan=0;plan<2;plan++){const goals=Array.from({length:30},(_,i)=>({id:'many-'+i,name:'Meta '+i,criteria:'Observação',progress:0,status:'Em progresso'}));put('many-plan-'+plan,'plan',{patientId:'p',name:'Plano '+plan,status:'Ativo',goals});manyGoals.push(...goals.map(g=>({planId:'many-plan-'+plan,goalId:g.id,observed:true,correct:1,help:0,attempts:2,note:'Nota preservada '+g.id})));}
r=await invoke({...base,appointmentId:'new-ap',goalResults:manyGoals,final:true});assert.equal(r.status,200);assert.equal(r.record.data.goalResults.length,60);assert.equal(r.record.data.correct,60);assert.equal(r.record.data.goalResults[59].note,'Nota preservada many-29');
// A patient reassignment during the save must invalidate the session mutation.
put('transfer-ap','appointment',{patientId:'p',therapist:'t1',date:today,time:'16:00',duration:45,status:'Esperado'});
identity.role='therapist';identity.therapist='t1';
d1.beforeBatch=()=>sqlite.prepare("UPDATE records SET data=json_set(data,'$.therapist','t2'),version=version+1 WHERE id='c:p'").run();
assert.equal((await invoke({...base,appointmentId:'transfer-ap',goalResults:[],final:true})).status,409);
assert.equal(sqlite.prepare("SELECT count(*) AS n FROM records WHERE id='c:care-transfer-ap'").get().n,0);
assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='c:transfer-ap'").get().data).status,'Esperado');
sqlite.prepare("UPDATE records SET data=json_set(data,'$.therapist','t1'),version=version+1 WHERE id='c:p'").run();identity.role='director';
put('tomorrow','appointment',{patientId:'p',therapist:'t1',date:nextDay(today),time:'10:00',status:'Esperado'});
await invoke({action:'refresh'});await invoke({action:'refresh'});rows=await allRecords(identity);assert.equal(rows.filter(r=>r.kind==='careNotice'&&r.data.type==='brief').length,1);assert.match(preparation(rows,rows.find(r=>r.id==='tomorrow')).body,/Correção identificada/);
assert.equal(attendanceIssues(rows,{date:today,time:'10:00'}).length,1);put('leave','leave',{therapist:'t1',date:today,endDate:today,status:'Aprovado'});assert.equal(attendanceIssues(await allRecords(identity),{date:today,time:'10:00'}).length,0);
identity.role='therapist';identity.therapist='t2';assert.equal((await invoke({action:'amend',sessionId:'care-ap',id:'bad',body:'x'})).status,403);identity.tenant='other-clinic';assert.equal((await invoke({action:'amend',sessionId:'care-ap',id:'bad',body:'x'})).status,403);
console.log('Care integration: sessions, stale writes, goals, approved sharing, immutable notes, plan revisions, brief deduplication and tenant isolation passed.');
