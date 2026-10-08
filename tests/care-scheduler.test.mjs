import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

const compile=file=>ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE clinics(id TEXT PRIMARY KEY,owner TEXT); CREATE TABLE records(id TEXT PRIMARY KEY,clinic TEXT,kind TEXT,data TEXT,author TEXT,version INTEGER,updated TEXT); CREATE TABLE memberships(id TEXT PRIMARY KEY,clinic TEXT,therapist TEXT,email TEXT,enabled INTEGER); CREATE TABLE audit(id TEXT PRIMARY KEY,clinic TEXT,action TEXT)');
const database={prepare(sql){return {bind(...args){return {async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null}}},async all(){return {results:sqlite.prepare(sql).all()}}}}};
globalThis.schedulerTest={database,env:{},runs:0,throwRun:false};
const env=url('export const env=globalThis.schedulerTest.env');
const care=url(compile('lib/care.ts'));
const server=url("export const db=()=>globalThis.schedulerTest.database;export async function allRecords(a){const q=await db().prepare('SELECT * FROM records WHERE clinic=?').bind(a.tenant).all();return q.results.map(r=>({id:r.id.slice(a.tenant.length+1),kind:r.kind,version:r.version,data:JSON.parse(r.data)}))}");
const careServer=url(`import {db} from '${server}';export const mailReady=()=>Boolean(globalThis.schedulerTest.env.RESEND_API_KEY&&globalThis.schedulerTest.env.MAIL_FROM);export const notification=(id,data)=>({id,kind:'careNotice',data:{...data,createdAt:new Date().toISOString()}});export function insertRecord(a,r){return db().prepare('INSERT OR IGNORE INTO records VALUES(?,?,?,?,?,1,?)').bind(a.tenant+':'+r.id,a.tenant,r.kind,JSON.stringify(r.data),a.user.userId,new Date().toISOString())}export async function runClinic(a,options){if(!options.preparationOnly)throw Error('Attendance must not run in evening cron');globalThis.schedulerTest.runs++;if(globalThis.schedulerTest.throwRun)throw Error('Simulated failure');return {prepared:2}}`);
const mailServer=url(`export const mailReady=async()=>Boolean(globalThis.schedulerTest.env.RESEND_API_KEY&&globalThis.schedulerTest.env.MAIL_FROM);export async function prepareMail(a){if(!await mailReady(a))throw Error('Mail unavailable');return {provider:'resend',async send({to,subject,text,id}){try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':a.tenant+'/'+id},body:JSON.stringify({from:globalThis.schedulerTest.env.MAIL_FROM,to:[to],subject,text})});const body=await response.json();return {status:response.ok&&body.id?'Aceite pelo serviço':'Falhou',providerId:body.id||'',provider:'resend'}}catch{return {status:'Resultado desconhecido',providerId:'',provider:'resend'}}}}}`);
const scheduler=url(compile('lib/care-scheduler.ts').replace("'cloudflare:workers'",JSON.stringify(env)).replace("'./server'",JSON.stringify(server)).replace("'./care-server'",JSON.stringify(careServer)).replace("'./mail-server'",JSON.stringify(mailServer)).replace("'./care'",JSON.stringify(care)));
const {preparationScheduleDue,preparationRecipients,runScheduledPreparations,preparationEmailEnabled}=await import(scheduler);
assert.equal(preparationScheduleDue(new Date('2026-07-01T17:05:00Z')),true);
assert.equal(preparationScheduleDue(new Date('2026-07-01T18:05:00Z')),false);
assert.equal(preparationScheduleDue(new Date('2026-12-01T17:05:00Z')),false);
assert.equal(preparationScheduleDue(new Date('2026-12-01T18:05:00Z')),true);
assert.equal(preparationScheduleDue(new Date('2026-10-25T18:05:00Z')),true);
assert.equal(await preparationEmailEnabled({tenant:'c'}),false);
const team={id:'t',kind:'team',data:{name:'Teste',email:'therapist@example.invalid',status:'Ativo',preparationEmail:'Sim'}};
const appointment={id:'a',kind:'appointment',data:{date:'2026-07-02',therapist:'t',status:'Esperado'}};
const verified=[{therapist:'t',email:'therapist@example.invalid'}];
assert.equal(preparationRecipients([team,appointment],verified,'2026-07-02').length,1);
for(const data of [{...team.data,preparationEmail:undefined},{...team.data,status:'Inativo'},{...team.data,email:'changed@example.invalid'}])assert.equal(preparationRecipients([{...team,data},appointment],verified,'2026-07-02').length,0);
assert.equal(preparationRecipients([team,appointment],[],'2026-07-02').length,0);
assert.equal(preparationRecipients([team,{...appointment,data:{...appointment.data,status:'Remarcada'}}],verified,'2026-07-02').length,0);
sqlite.prepare('INSERT INTO clinics VALUES(?,?)').run('c','owner');
const put=(id,kind,data)=>sqlite.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,1,?)').run('c:'+id,'c',kind,JSON.stringify(data),'owner','2026-07-01');
put('t','team',team.data);put('a','appointment',appointment.data);
sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('m','c','t','therapist@example.invalid',1);
let sent=0,lastRequest;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,init)=>{sent++;lastRequest=JSON.parse(init.body);return Response.json({id:'provider-test-id'})};
try{
 assert.equal((await runScheduledPreparations(new Date('2026-07-01T18:05:00Z'))).skipped,true);
 let result=await runScheduledPreparations(new Date('2026-07-01T17:05:00Z'));
 assert.equal(result.prepared,2);assert.equal(sent,0);assert.equal(globalThis.schedulerTest.runs,1);
 await runScheduledPreparations(new Date('2026-07-01T17:06:00Z'));
 assert.equal(globalThis.schedulerTest.runs,1); // native + external repeat is idempotent
 let note=JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='c:preparation-scheduler-2026-07-01'").get().data);
 assert.equal(note.status,'Concluído');assert.equal(note.directorOnly,true);assert.match(note.body,/email desativados/);
 Object.assign(globalThis.schedulerTest.env,{CARE_TEAM_EMAIL_ENABLED:'true',RESEND_API_KEY:'test-only',MAIL_FROM:'test@example.invalid'});
 put('a','appointment',{...appointment.data,date:'2026-07-03'});
 await runScheduledPreparations(new Date('2026-07-02T17:05:00Z'));
 assert.equal(sent,0); // configured + opt-in still requires proven authenticated access
 sqlite.prepare('INSERT INTO audit VALUES(?,?,?)').run('first-access:m','c','first_professional_access');
 put('a','appointment',{...appointment.data,date:'2026-07-04'});
 await runScheduledPreparations(new Date('2026-07-03T17:05:00Z'));
 assert.equal(sent,1);assert.deepEqual(lastRequest.to,['therapist@example.invalid']);assert.match(lastRequest.text,/#preparation/);assert.equal(lastRequest.text.includes('Paciente'),false);
 await runScheduledPreparations(new Date('2026-07-03T17:05:00Z'),'external');assert.equal(sent,1);
 globalThis.schedulerTest.throwRun=true;
 result=await runScheduledPreparations(new Date('2026-07-04T17:05:00Z'));
 assert.equal(result.failed,1);assert.equal(sent,1);
 note=JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='c:preparation-scheduler-2026-07-04'").get().data);
 assert.equal(note.status,'Falhou');
 globalThis.schedulerTest.throwRun=false;
 result=await runScheduledPreparations(new Date('2026-07-04T17:05:00Z'),'external');
 assert.equal(result.failed,0);assert.equal(result.clinics,1);assert.equal(sent,1);
 note=JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='c:preparation-scheduler-2026-07-04'").get().data);
 assert.equal(note.status,'Concluído');
 // A provider timeout leaves an immutable daily claim. Neither an external
 // retry nor another native run can duplicate a possibly accepted email.
 put('a','appointment',{...appointment.data,date:'2026-07-06'});
 globalThis.fetch=async()=>{sent++;throw new Error('Simulated timeout after provider request')};
 await runScheduledPreparations(new Date('2026-07-05T17:05:00Z'));
 assert.equal(sent,2);
 note=JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='c:preparation-email-2026-07-06-t'").get().data);
 assert.equal(note.status,'Resultado desconhecido');
 await runScheduledPreparations(new Date('2026-07-05T17:06:00Z'),'external');
 assert.equal(sent,2);
}finally{globalThis.fetch=originalFetch;sqlite.close()}
console.log('Care scheduler: Lisbon/DST, daily deduplication, disabled-by-default email, confirmed access, privacy and failure state passed.');
