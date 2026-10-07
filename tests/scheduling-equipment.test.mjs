import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const require=createRequire(import.meta.url),url=body=>'data:text/javascript;base64,'+Buffer.from(body).toString('base64'),modules=new Map();
function moduleUrl(file,mocks={}){
 file=path.resolve(file);
 if(modules.has(file))return modules.get(file);
 let source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 source=source.replace(/from (['"])([^'"]+)\1/g,(_all,_quote,specifier)=>{
  const target=mocks[specifier]||(specifier==='zod'?pathToFileURL(require.resolve('zod')).href:moduleUrl(specifier.startsWith('@/')?specifier.slice(2)+'.ts':path.resolve(path.dirname(file),specifier+'.ts'),mocks));
  return 'from '+JSON.stringify(target);
 });
 const result=url(source);modules.set(file,result);return result;
}
const {appointmentAvailability,requiresAvailabilityCheck}=await import(moduleUrl('lib/scheduling.ts'));
const {equipmentUseAllowed,equipmentUseRecord,normalizeEquipmentMutation}=await import(moduleUrl('lib/equipment.ts'));
const rec=(id,kind,data)=>({id,kind,data,version:1,author:'owner'});
const director={role:'director',therapist:'t1',tenant:'clinic',user:{userId:'owner'}},therapist={...director,role:'therapist',user:{userId:'u1'}};
const team=rec('t1','team',{name:'Ana',status:'Ativo'}),other=rec('t2','team',{name:'Inês',status:'Ativo'}),room=rec('room','room',{name:'Sala',status:'Disponível'}),patient=rec('p1','patient',{name:'Paciente de teste',therapist:'t1',status:'Ativo'});
const base=[team,other,room,patient],data={patientId:'p1',therapist:'t1',date:'2026-10-07',time:'09:00',duration:45,context:'Clínica',room:'room',status:'Esperado'};
const absence=rec('absence','leave',{therapist:'t1',date:'2026-10-07',endDate:'2026-10-08',status:'Aprovado'});
assert.equal(appointmentAvailability(base,data),null);
assert.match(appointmentAvailability([...base,absence],data),/ausência aprovada/);
assert.equal(appointmentAvailability([...base,{...absence,data:{...absence.data,status:'Por aprovar'}}],data),null);
assert.equal(appointmentAvailability([...base,{...absence,data:{...absence.data,therapist:'t2'}}],data),null);
for(const status of ['Inativo','Arquivado','Ausente'])assert.match(appointmentAvailability([{...team,data:{...team.data,status}},room],data),/indisponível/);
assert.match(appointmentAvailability([team,{...room,data:{...room.data,status:'Indisponível'}}],data),/sala está indisponível/);
assert.equal(appointmentAvailability([team],{...data,context:'Escola'}),null);
const scheduled={...team,data:{...team.data,workDays:'1,3',startTime:'09:00',endTime:'17:00'}};
assert.equal(appointmentAvailability([scheduled,room],data),null);
assert.match(appointmentAvailability([scheduled,room],{...data,date:'2026-10-08'}),/dias de trabalho/);
assert.match(appointmentAvailability([scheduled,room],{...data,time:'08:45'}),/antes do horário/);
assert.match(appointmentAvailability([scheduled,room],{...data,time:'16:30'}),/depois do horário/);
assert.equal(appointmentAvailability([{...team,data:{...team.data,hours:4}},room],{...data,time:'18:00'}),null);
assert.match(appointmentAvailability(base,{...data,date:'2026-02-30'}),/Data/);
const booked=rec('booked','appointment',data);
assert.match(appointmentAvailability([...base,booked],{...data,time:'09:30'}),/sobreposição/);
assert.equal(appointmentAvailability([...base,booked],{...data,time:'09:45'}),null);
assert.equal(appointmentAvailability([...base,booked],data,'booked'),null);
assert.equal(requiresAvailabilityCheck({...data,status:'Concluída'},data),false);
assert.equal(requiresAvailabilityCheck({...data,time:'10:00'},data),true);
assert.equal(requiresAvailabilityCheck({...data,status:'Cancelada'},data),false);

const item=rec('item','equipment',{name:'Tablet',status:'Disponível',notes:'Inventário'}),now='2026-10-07T11:00:00Z';
const pickup=equipmentUseRecord(item,'t1');normalizeEquipmentMutation(pickup,item,base,therapist,now);
assert.equal(pickup.data.checkoutAt,now);assert.equal(pickup.data.holder,'t1');
const returned=equipmentUseRecord(pickup,'t1');normalizeEquipmentMutation(returned,pickup,base,therapist,now);
assert.equal(returned.data.status,'Disponível');assert.equal(returned.data.checkoutAt,'');assert.equal(returned.data.holder,'');
assert.throws(()=>normalizeEquipmentMutation({...pickup,data:{...pickup.data,name:'Renamed'}},item,base,therapist,now),/inventário/);
assert.throws(()=>normalizeEquipmentMutation({...pickup,data:{...pickup.data,holder:'t2'}},item,base,therapist,now),/outra pessoa/);
assert.throws(()=>normalizeEquipmentMutation(returned,{...pickup,data:{...pickup.data,holder:'t2'}},base,therapist,now),/outra pessoa/);
assert.equal(equipmentUseAllowed({...item,data:{...item.data,status:'Manutenção'}},director),false);

// Exercise the real POST and its SQL against an isolated database, including
// changes committed between the validation read and the guarded write.
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE records(id TEXT PRIMARY KEY,clinic TEXT,kind TEXT,data TEXT,author TEXT,version INTEGER,updated TEXT); CREATE TABLE audit(id TEXT PRIMARY KEY,clinic TEXT,actor TEXT,action TEXT,record_id TEXT,created TEXT);');
const insert=r=>sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run('clinic:'+r.id,'clinic',r.kind,JSON.stringify(r.data),r.author,r.version,now);
const read=()=>sqlite.prepare('SELECT * FROM records').all().map(r=>({...r,id:r.id.slice(7),data:JSON.parse(r.data)}));
const state=globalThis.__schedulingEquipment={access:therapist,read,beforeBatch:null,database:{prepare:sql=>({bind:(...args)=>({sql,args})}),batch:async statements=>{
 if(state.beforeBatch){const change=state.beforeBatch;state.beforeBatch=null;change();}
 sqlite.exec('BEGIN');try{const results=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.args)}));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}
}}};
const accessUrl=moduleUrl('lib/access.ts');
const {validateWorkflow}=await import(moduleUrl('lib/workflows.ts'));
const reservation=rec('reservation','equipmentReservation',{equipmentId:'item',therapist:'t1',date:data.date,time:'09:00',duration:45,status:'Reservada'});
const maintained={...item,data:{...item.data,status:'Manutenção'}};
assert.doesNotThrow(()=>validateWorkflow({...reservation,data:{...reservation.data,status:'Cancelada'}},reservation,[...base,maintained],therapist));
assert.throws(()=>validateWorkflow({...reservation,data:{...reservation.data,status:'Cancelada'}},undefined,[...base,maintained],therapist),/Equipamento indisponível/);
assert.throws(()=>validateWorkflow({...reservation,data:{...reservation.data,status:'Cancelada',therapist:'t2'}},reservation,[...base,maintained],director),/Equipamento indisponível/);
assert.throws(()=>validateWorkflow({...reservation,data:{...reservation.data,status:'Cancelada',equipmentId:'changed'}},reservation,[...base,maintained,{...maintained,id:'changed'}],director),/Equipamento indisponível/);
const server=url(`export {visible,mayWrite} from ${JSON.stringify(accessUrl)}; export const db=()=>globalThis.__schedulingEquipment.database; export const identity=async()=>globalThis.__schedulingEquipment.access; export const ensureClinic=async()=>{};export const allRecords=async()=>globalThis.__schedulingEquipment.read();export const checkOrigin=()=>{};export class AppError extends Error{constructor(message,status=400){super(message);this.status=status}};export const failure=e=>Response.json({error:e.message},{status:e.status||500});`);
const careServer=url('export const insertRecord=()=>{throw Error("Unexpected insertRecord")};export const notification=()=>{throw Error("Unexpected notification")};');
const {POST}=await import(moduleUrl('app/api/data/route.ts',{'@/lib/server':server,'@/lib/care-server':careServer}));
const reset=(extra=[])=>{sqlite.exec('DELETE FROM audit;DELETE FROM records;');[...base,...extra].forEach(insert);state.access=therapist;state.beforeBatch=null;};
const post=record=>POST(new Request('https://clinic.test/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)}));
const appointment=()=>({...rec('new','appointment',{...data}),version:0});
reset([item]);
assert.equal((await post({...equipmentUseRecord(item,'t1'),action:undefined})).status,403);
assert.equal((await post(equipmentUseRecord(item,'t1'))).status,200);
assert.equal(read().find(r=>r.id==='item').data.holder,'t1');
assert.equal((await post(equipmentUseRecord(item,'t1'))).status,409); // Old free snapshot cannot pick up an occupied item.
const currentItem=read().find(r=>r.id==='item');
assert.equal((await post(equipmentUseRecord(currentItem,'t1'))).status,200);
reset([item]);
assert.equal((await post({...equipmentUseRecord(item,'t1'),data:{...equipmentUseRecord(item,'t1').data,notes:'Tampered'}})).status,403);
assert.equal(read().find(r=>r.id==='item').data.notes,'Inventário');
reset([{...item,data:{...item.data,status:'Manutenção'}}]);assert.equal((await post(equipmentUseRecord(read().find(r=>r.id==='item'),'t1'))).status,409);
reset([item]);state.beforeBatch=()=>sqlite.prepare("UPDATE records SET version=2,data=? WHERE id='clinic:item'").run(JSON.stringify({...item.data,status:'Em uso',holder:'t2'}));
assert.equal((await post(equipmentUseRecord(item,'t1'))).status,409);
assert.equal(read().find(r=>r.id==='item').data.holder,'t2');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
reset([absence]);assert.equal((await post(appointment())).status,409);
reset();assert.equal((await post(appointment())).status,200);
reset();state.beforeBatch=()=>insert(absence);assert.equal((await post(appointment())).status,409);assert(!read().some(r=>r.id==='new'));
reset();state.beforeBatch=()=>sqlite.prepare("UPDATE records SET version=2,data=? WHERE id='clinic:room'").run(JSON.stringify({...room.data,status:'Indisponível'}));
assert.equal((await post(appointment())).status,409);
reset();state.beforeBatch=()=>sqlite.prepare("UPDATE records SET version=2,data=? WHERE id='clinic:t1'").run(JSON.stringify({...team.data,status:'Inativo'}));
assert.equal((await post(appointment())).status,409);
reset();state.beforeBatch=()=>insert(booked);assert.equal((await post(appointment())).status,409);
// Legacy records can store a blank context. A room clash must still be caught
// when its patient and therapist differ and it arrives after validation.
reset();state.beforeBatch=()=>insert({...booked,data:{...booked.data,context:'',patientId:'p2',therapist:'t2'}});
assert.equal((await post(appointment())).status,409);assert(!read().some(r=>r.id==='new'));
reset([booked,absence]);assert.equal((await post({...booked,data:{...booked.data,status:'Cancelada'}})).status,200);
reset([booked]);state.access=director;assert.equal((await post({...absence,version:0})).status,409);
reset();state.access=director;state.beforeBatch=()=>insert(booked);assert.equal((await post({...absence,version:0})).status,409);
assert(!read().some(r=>r.id==='absence'));assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
sqlite.close();delete globalThis.__schedulingEquipment;
console.log('Scheduling/equipment passed: confirmed hours, days, leave, room, overlaps, narrow inventory actions and SQL race/version guards.');
