import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const urls=new Map();
function moduleUrl(name){
 if(urls.has(name))return urls.get(name);
 const code=ts.transpileModule(source('lib/'+name+'.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/from ['"]\.\/([^'"]+)['"]/g,(_match,dependency)=>'from '+JSON.stringify(moduleUrl(dependency)));
 const result='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(name,result);return result;
}
const report=await import(moduleUrl('session-report'));
const clinical=await import(moduleUrl('clinical'));
const finance=await import(moduleUrl('finance'));
const rec=(id,kind,data)=>({id,kind,data,version:1});
const patient=rec('p','patient',{name:'Criança de teste',birthDate:'2018-01-01',objectives:'Objetivo documentado',status:'Ativo'});
const completed=rec('s','session',{patientId:'p',date:'2026-10-01',duration:45,status:'Concluída',careSchema:1,
 summary:'Produziu o alvo em contexto funcional.',nextSteps:'Retomar com menos apoio.',materials:'Cartões e espelho',
 internalNote:'NOTA PRIVADA NÃO EXPORTAR',familySummary:'Texto separado para a família',correct:8,help:1,error:1,
 goalResults:[{goalId:'g',goalName:'Produzir o alvo',criteria:'80% em duas sessões',observed:true,attempts:10,correct:8,help:1,note:'Beneficiou de suporte visual'},
  {goalId:'g2',goalName:'Compreensão',observed:false,attempts:0,correct:0,help:0}]
});
const draft=rec('draft','session',{...completed.data,date:'2026-10-07',status:'Rascunho',summary:'RASCUNHO NÃO CONTAR'});
const amendment=rec('am','sessionAmendment',{patientId:'p',sessionId:'s',date:'2026-10-02',body:'Correção profissional identificada.'});
const unrelated=rec('wrong','sessionAmendment',{patientId:'another',sessionId:'s',date:'2026-10-02',body:'ADENDA DE OUTRA CRIANÇA'});
const rows=[patient,completed,draft,amendment,unrelated];

assert.deepEqual(report.completedSessions(rows,'p').map(r=>r.id),['s']);
assert.equal(report.isCompletedSession({...completed,data:{...completed.data,status:undefined}},rows),false);
assert.equal(report.isCompletedSession({...completed,data:{...completed.data,status:'Cancelada'}},rows),false);
const legacy=rec('legacy','session',{patientId:'p',date:'2026-09-30',appointmentId:'ap',soap:{s:'Relato',o:'Observação',a:'Análise clínica',p:'Plano antigo',internalNote:'SOAP PRIVADO'}});
const appointment=rec('ap','appointment',{patientId:'p',status:'Concluída'});
assert.equal(report.isCompletedSession(legacy,[appointment]),true);
assert.equal(report.isCompletedSession(legacy,[{...appointment,data:{patientId:'another',status:'Concluída'}}]),false);
assert.equal(report.isCompletedSession(legacy,[{...appointment,data:{patientId:'p',status:'Esperado'}}]),false);
assert.equal(report.isCompletedSession({...legacy,data:{...legacy.data,status:'Rascunho'}},[appointment]),false);
assert.equal(report.isCompletedSession({...legacy,data:{...legacy.data,careSchema:1}},[appointment]),false);

const body=report.sessionReportBody(completed,rows);
for(const expected of ['Produziu o alvo','Retomar com menos apoio','Cartões e espelho','8/10','80%','Beneficiou de suporte visual','Não medido nesta sessão','Correção profissional identificada'])assert.ok(body.includes(expected),expected);
for(const forbidden of ['NOTA PRIVADA','Texto separado para a família','ADENDA DE OUTRA CRIANÇA'])assert.equal(body.includes(forbidden),false,forbidden);
const oldBody=report.sessionReportBody(legacy,[appointment]);
for(const expected of ['Relato','Observação','Análise clínica','Plano antigo'])assert.ok(oldBody.includes(expected));
assert.equal(oldBody.includes('SOAP PRIVADO'),false);
const payload=report.sessionReportDraft(completed,rows);
assert.equal(payload.status,'Rascunho');assert.equal(payload.recipient,'Interno');assert.equal(payload.sessionId,'s');
const history=report.clinicalHistoryBody(patient,rows,8);
assert.ok(history.includes('Sessões concluídas: 1'));assert.ok(history.includes('Correção profissional identificada'));
assert.equal(history.includes('RASCUNHO NÃO CONTAR'),false);assert.equal(history.includes('NOTA PRIVADA'),false);

// Clinical flags ignore drafts for activity, progression and regression.
const threeDrafts=Array.from({length:3},(_,i)=>rec('d'+i,'session',{...draft.data,date:'2026-10-0'+(i+1),correct:9,help:0,error:1}));
assert.deepEqual(clinical.flags([patient,...threeDrafts],'2026-10-07'),[]);
const old=rec('old','session',{...completed.data,date:'2026-09-01'});
assert.ok(clinical.flags([patient,old,draft],'2026-10-07').some(x=>x.type==='Inatividade'));
const threeFinal=threeDrafts.map(r=>({...r,data:{...r.data,status:'Concluída'}}));
assert.ok(clinical.flags([patient,...threeFinal],'2026-10-07').some(x=>x.type==='Transição'));
const bill=(id,type,dueDate)=>rec(id,'invoice',{patientId:'p',type,status:'Por pagar',date:'2026-09-01',dueDate});
assert.equal(clinical.flags([patient,bill('future','Receita','2026-10-15'),bill('cost','Custo','2026-09-01')],'2026-10-07').length,0);
assert.ok(clinical.flags([patient,bill('due','Receita','2026-10-06')],'2026-10-07').some(x=>x.type==='Financeiro'));

// Exercise the actual component callbacks: a rendered button must open the new draft.
let opened;
const noop=()=>{};
const GridTable=()=>{},Card=()=>{},Button=()=>{};
const context={records:rows,date:'2026-10-07',director:true,me:'t',open:(...args)=>opened=args};
const shared={usePro:()=>context,GridTable,Card,Empty:noop,Pick:noop,Add:noop,Badge:noop,StatGrid:noop,
 day:()=>context.date,money:n=>String(n),fresh:noop,download:noop,exportCsv:noop,safeUrl:noop};
function loadComponent(file,selectedPatient=''){
 const code=ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 let state=0;
 const stubRequire=name=>{
  if(name==='react')return {useState:initial=>[state++===0&&selectedPatient?selectedPatient:initial,noop],useRef:()=>({current:null})};
  if(name==='react/jsx-runtime')return require(name);
  if(name==='./shared')return shared;
  if(name==='@/lib/clinical')return clinical;
  if(name==='@/lib/session-report')return report;
  if(name==='@/lib/finance')return finance;
  if(name==='@/lib/patients')return {patientAge:()=>8};
  if(name==='@/lib/model')return {districts:[]};
  if(name==='sonner')return {toast:{error:noop}};
  return new Proxy({Button},{get:(target,key)=>target[key]||noop});
 };
 const exports={};vm.runInNewContext(code,{exports,require:stubRequire},{filename:file});return exports;
}
function elements(node,predicate,result=[]){
 if(Array.isArray(node)){for(const item of node)elements(item,predicate,result);return result}
 if(!node||typeof node!=='object')return result;
 if(predicate(node))result.push(node);
 elements(node.props?.children,predicate,result);return result;
}
const {Reports}=loadComponent('app/pro/clinical.tsx');
const tables=elements(Reports(),node=>node.type===GridTable);
assert.equal(tables[1].props.rows.length,1);
tables[1].props.rows[0][3].props.onClick();
assert.equal(opened[0],'report');assert.equal(opened[2].recipient,'Interno');assert.equal(opened[2].body,body);
const {ClinicalTools}=loadComponent('app/pro/management.tsx','p');
const historyTree=ClinicalTools();
const pre=elements(historyTree,node=>node.type==='pre')[0];
assert.equal(pre.props.children,history);
const prepare=elements(historyTree,node=>node.type===Button&&node.props.children==='Preparar relatório para revisão')[0];
prepare.props.onClick();assert.equal(opened[2].recipient,'Interno');assert.equal(opened[2].body,history);

console.log('Clinical reports: current and SOAP summaries, goal measurements, materials, scoped amendments, private-note exclusion, completed-only indicators and actual report actions passed.');
