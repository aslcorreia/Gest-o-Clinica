import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const url=body=>'data:text/javascript;base64,'+Buffer.from(body).toString('base64');
const compile=file=>ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helperUrl=url(compile('lib/plan-sessions.ts'));
const {reconcileDraftGoals,sessionGoalPayload}=await import(helperUrl);
const goal={id:'g',name:'Objetivo',criteria:'Critério',progress:0,status:'Não iniciado'};
const draft={id:'plan',kind:'plan',version:1,data:{patientId:'p',name:'Plano',context:'Clínica',status:'Rascunho',goals:[goal]}};
const state={hooks:['Todos',structuredClone(draft),null,'Concluído',''],index:0,saved:null};
const p={records:[draft],director:true,busy:false,save:async r=>{state.saved=r;return true}};
globalThis.planUi={useState(initial){const index=state.index++;if(state.hooks[index]===undefined)state.hooks[index]=initial;return [state.hooks[index],v=>{state.hooks[index]=typeof v==='function'?v(state.hooks[index]):v}]},usePro:()=>p,useCare:()=>({busy:false,run:async()=>null})};
const runtime=url('export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="Fragment";');
const stubNames=['GoalProgress','Button','Input','Textarea','Progress','Tabs','TabsList','TabsTrigger','TabsContent','Dialog','DialogContent','DialogHeader','DialogTitle','DialogDescription','Card','GridTable','Pick','Badge','Empty','StatGrid','Pipeline','Prescriptions'];
const moduleSource=compile('app/pro/complete-clinical.tsx').replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g,'');
const boardModule=url(`import {jsx as _jsx,jsxs as _jsxs,Fragment as _Fragment} from ${JSON.stringify(runtime)};import {planIsLocked} from ${JSON.stringify(helperUrl)};const {useState,usePro,useCare}=globalThis.planUi;const uid=()=>"id",fresh=()=>{},day=()=>"2026-10-07",exportCsv=()=>{};${stubNames.map(name=>`const ${name}=${JSON.stringify(name)};`).join('')}\n${moduleSource}`);
const {PlanBoard}=await import(boardModule);
const visit=(node,match)=>{if(!node)return null;if(Array.isArray(node)){for(const child of node){const found=visit(child,match);if(found)return found;}return null;}if(typeof node!=='object')return null;if(match(node))return node;return visit(node.props?.children,match);};
const render=()=>{state.index=0;return PlanBoard({});};
// Exercise the actual select handler and a second render, the transition that used
// to disable the fieldset and remove Save before it could reach the API.
let tree=render();
const statusSelect=visit(tree,n=>n.type==='Pick'&&n.props.value==='Rascunho');
assert(statusSelect);statusSelect.props.change('Aprovado');
tree=render();assert.equal(visit(tree,n=>n.type==='fieldset').props.disabled,false);
const save=visit(tree,n=>n.type==='Button'&&n.props.children==='Guardar plano');assert(save);assert.equal(save.props.disabled,false);
await save.props.onClick();assert.equal(state.saved.data.status,'Aprovado');
const approved={...state.saved,version:2};p.records=[approved];state.hooks[1]=approved;
tree=render();assert.equal(visit(tree,n=>n.type==='fieldset').props.disabled,true);assert.equal(visit(tree,n=>n.type==='Button'&&n.props.children==='Guardar plano'),null);
assert(visit(tree,n=>n.type==='Button'&&n.props.children==='Concluir / arquivar'));

const active={...draft,data:{...draft.data,status:'Ativo'}};
assert.equal(reconcileDraftGoals([active],'p',[]).length,1); // draft created before initial approval
const measured={planId:'plan',goalId:'g',goalName:'Nome original',criteria:'Critério original',observed:true,correct:4,help:1,attempts:6,note:'Texto a preservar',planVersion:1};
const revised={id:'revised',kind:'plan',version:1,data:{patientId:'p',status:'Ativo',goals:[{...goal,id:'new'}]}};
const merged=reconcileDraftGoals([{...active,data:{...active.data,status:'Substituído'}},revised],'p',[measured]);
assert.equal(merged.length,2);assert.equal(merged[0].historicalGoal,true);assert.equal(merged[0].note,measured.note);assert.equal(merged[0].goalName,'Nome original');assert.equal(merged[1].goalId,'new');
const payload=sessionGoalPayload(merged);assert.equal(payload.length,1);assert.equal(payload[0].correct,4);
merged[1].note='Observação sem contagem';assert.equal(sessionGoalPayload(merged).length,2);
merged[0]={...merged[0],observed:false,correct:0,help:0,attempts:0,note:''};assert.equal(sessionGoalPayload(merged).length,2); // explicit clearing of a saved draft remains expressible
console.log('Plan UI approval transition, preserved versions and draft objective reconciliation passed.');
