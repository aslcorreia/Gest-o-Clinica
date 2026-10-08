import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE clinics(id TEXT PRIMARY KEY,owner TEXT); CREATE TABLE records(id TEXT PRIMARY KEY,clinic TEXT,kind TEXT,data TEXT,author TEXT,version INTEGER,updated TEXT); CREATE TABLE memberships(id TEXT PRIMARY KEY,clinic TEXT,therapist TEXT,email TEXT,enabled INTEGER); CREATE TABLE audit(id TEXT PRIMARY KEY,clinic TEXT,actor TEXT,action TEXT,record_id TEXT,created TEXT); CREATE TABLE integration_connections(clinic TEXT,user_id TEXT,provider TEXT,payload TEXT,version INTEGER,updated TEXT,PRIMARY KEY(clinic,user_id,provider));');
const database={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}}},async all(){return {results:sqlite.prepare(sql).all()}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
const sender='centro.bemcrescer@gmail.com',scope='https://www.googleapis.com/auth/gmail.send';
const owner={tenant:'clinic',role:'director',owner:true,therapist:'owner-profile',user:{userId:'owner-user',email:'owner@example.invalid'}};
const therapist={...owner,role:'therapist',owner:false,therapist:'t',user:{userId:'therapist-user',email:'therapist@example.invalid'}};
const outsider={...owner,tenant:'other-clinic',user:{userId:'other-owner'}};
globalThis.gmailTest={database,env:{}};
const mocks={
 'cloudflare:workers':dataUrl('export const env=globalThis.gmailTest.env;'),
 './supabase-http':dataUrl("export const serviceConfig=()=>({SUPABASE_SECRET_KEY:'FAKE_DB_TEST_SECRET'});"),
 './server':dataUrl("export const db=()=>globalThis.gmailTest.database;export class AppError extends Error{constructor(message,status=400){super(message);this.status=status}}export async function allRecords(a){return (await db().prepare('SELECT * FROM records WHERE clinic=?').bind(a.tenant).all()).results.map(r=>({...r,id:r.id.slice(a.tenant.length+1),data:JSON.parse(r.data)}))}")
};
const modules=new Map();
function module(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);let source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;source=source.replace(/from (['"])([^'"]+)\1/g,(_,q,dependency)=>'from '+JSON.stringify(mocks[dependency]||module(path.resolve(path.dirname(file),dependency+'.ts'))));const result=dataUrl(source);modules.set(file,result);return result;}
const integration=await import(module('lib/integrations-server.ts'));
const mail=await import(module('lib/mail-server.ts'));
const care=await import(module('lib/care-server.ts'));
const scheduler=await import(module('lib/care-scheduler.ts'));
const {lisbonNow,nextDay}=await import(module('lib/care.ts'));
const env=globalThis.gmailTest.env;
sqlite.prepare('INSERT INTO clinics VALUES(?,?)').run(owner.tenant,owner.user.userId);
sqlite.prepare('INSERT INTO clinics VALUES(?,?)').run(outsider.tenant,outsider.user.userId);
const put=(id,kind,data,clinic=owner.tenant)=>sqlite.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,1,?)').run(clinic+':'+id,clinic,kind,JSON.stringify(data),'test-user','2026-10-08');
const record=id=>{const row=sqlite.prepare('SELECT * FROM records WHERE id=?').get(owner.tenant+':'+id);return {...row,id,data:JSON.parse(row.data)}};
const tokens={accessToken:'FAKE_GMAIL_ACCESS',refreshToken:'FAKE_GMAIL_REFRESH',expiresAt:Date.now()+3600000,email:sender,scope};
const calls=[];
let responseMode='accepted';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{const url=String(input);calls.push({url,options});if(url.includes('oauth2.googleapis.com/token')){if(responseMode==='revoked')return Response.json({error:'invalid_grant'},{status:400});return Response.json({access_token:'FAKE_REFRESHED_ACCESS',expires_in:3600,scope})}if(responseMode==='timeout')throw new Error('Simulated transport timeout');if(responseMode==='server-error')return Response.json({error:'Simulated error'},{status:503});if(responseMode==='rejected')return Response.json({error:'Simulated invalid recipient'},{status:400});return Response.json({id:'FAKE_PROVIDER_MESSAGE_ID'});};

try{
 // A Calendar authorization never makes the Gmail sender ready, and no fallback
 // provider is selected when an explicitly configured Gmail needs authorization.
 assert.equal(await mail.mailReady(therapist),false);
 Object.assign(env,{GOOGLE_CLIENT_ID:'FAKE_TEST_CLIENT',GOOGLE_CLIENT_SECRET:'FAKE_TEST_CLIENT_SECRET',GMAIL_SENDER_EMAIL:sender,RESEND_API_KEY:'FAKE_RESEND_KEY',MAIL_FROM:'service@example.invalid'});
 await integration.saveGoogleConnection(therapist,{...tokens,scope:'https://www.googleapis.com/auth/calendar.events.owned'},0);
 assert.equal(await mail.mailProvider(therapist),'none');
 assert.equal(calls.length,0);
 await integration.saveGoogleConnection(outsider,tokens,0,'gmail');
 assert.equal(await mail.mailReady(therapist),false);
 await integration.saveGoogleConnection(owner,tokens,0,'gmail');
 assert.equal(await mail.mailProvider(therapist),'gmail');
 const payload=sqlite.prepare("SELECT payload FROM integration_connections WHERE clinic=? AND provider='gmail'").get(owner.tenant).payload;
 assert(!payload.includes('FAKE_GMAIL_REFRESH'));
 await assert.rejects(()=>integration.unseal(payload,owner.tenant+':'+owner.user.userId));
 assert.equal(await integration.googleConnection(therapist,'gmail'),null);
 assert.equal((await integration.googleConnection(therapist)).scope,'https://www.googleapis.com/auth/calendar.events.owned');

 // MIME is UTF-8, folded safely, and protects all recipient/header boundaries.
 const text='Sumário revisto: atenção, expressão e comunicação.\nPróxima sessão: retomar o objetivo.\n'+('á🙂'.repeat(2000));
 const subject='Bem Crescer — sumário e próximos objetivos '.repeat(4);
 const mime=Buffer.from(await mail.gmailMime({from:sender,to:'parent@example.invalid',subject,text,id:'clinic/delivery-test'}),'base64url').toString('utf8');
 const [headers,body]=mime.split('\r\n\r\n');
 assert.match(headers,/^From: Bem Crescer <centro\.bemcrescer@gmail\.com>\r\nTo: parent@example\.invalid\r\n/);
 assert(!/^Cc:|^Bcc:/m.test(headers));assert.match(headers,/Content-Type: text\/plain; charset=UTF-8/);
 const encodedSubject=headers.match(/^Subject: (.*(?:\r\n .*)*)$/m)[1];
 assert.equal([...encodedSubject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(x=>Buffer.from(x[1],'base64').toString('utf8')).join(''),subject);
 assert.equal(Buffer.from(body.replace(/\r\n/g,''),'base64').toString('utf8'),text.replace(/\r?\n/g,'\r\n'));
 for(const line of mime.split('\r\n'))assert(Buffer.byteLength(line)<=998);
 for(const patch of [{from:sender+'\n'},{to:'parent@example.invalid\n'},{from:sender+'\r\nBcc: stranger@example.invalid'},{to:'parent@example.invalid\r\nBcc: stranger@example.invalid'},{subject:'Sumário\r\nBcc: stranger@example.invalid'},{id:'id\r\nBcc: stranger@example.invalid'}])await assert.rejects(()=>mail.gmailMime({from:sender,to:'parent@example.invalid',subject:'Sumário',text:'Revisto',id:'test',...patch}));

 // A therapist's request intentionally uses the clinic owner's authorized
 // sender. It never sends from the therapist's personal Calendar connection.
 const transport=await mail.prepareMail(therapist);
 let result=await transport.send({to:'parent@example.invalid',subject:'Sumário de acompanhamento',text:'Texto revisto autorizado',id:'delivery-test'});
 assert.deepEqual(result,{status:'Aceite pelo serviço',providerId:'FAKE_PROVIDER_MESSAGE_ID',provider:'gmail'});
 let sent=calls.at(-1);assert.equal(sent.url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
 assert.equal(sent.options.headers.Authorization,'Bearer FAKE_GMAIL_ACCESS');assert(!sent.options.headers['Idempotency-Key']);
 assert.match(Buffer.from(JSON.parse(sent.options.body).raw,'base64url').toString('utf8'),/^From: Bem Crescer <centro\.bemcrescer@gmail\.com>/);
 for(const mode of ['timeout','server-error','rejected']){responseMode=mode;const before=calls.length;result=await transport.send({to:'parent@example.invalid',subject:'Sumário',text:'Revisto',id:'failure-'+mode});assert.equal(result.status,mode==='rejected'?'Falhou':'Resultado desconhecido');assert.equal(result.providerId,'');assert.equal(calls.length,before+1)}

 // Claims are atomic and immutable: a successful or uncertain send cannot be
 // repeated, and patient changes prevent the provider POST altogether.
 put('p','patient',{name:'PRIVATE_CHILD',therapist:'t',guardianEmail:'parent@example.invalid',shareAuthorized:'Sim'});
 put('delivery','delivery',{patientId:'p',recipient:'parent@example.invalid',status:'Preparado',body:'Texto revisto para a família'});
 responseMode='accepted';let before=calls.length;
 assert.equal(await care.sendDelivery(therapist,record('delivery'),record('p')),'Aceite pelo serviço');
 assert.equal(calls.length,before+1);assert.equal(record('delivery').data.provider,'gmail');
 before=calls.length;await assert.rejects(()=>care.sendDelivery(therapist,record('delivery'),record('p')),error=>error.status===409);assert.equal(calls.length,before);
 put('uncertain','delivery',{patientId:'p',recipient:'parent@example.invalid',status:'Preparado',body:'Revisto'});responseMode='timeout';
 assert.equal(await care.sendDelivery(therapist,record('uncertain'),record('p')),'Resultado desconhecido');
 before=calls.length;await assert.rejects(()=>care.sendDelivery(therapist,record('uncertain'),record('p')),error=>error.status===409);assert.equal(calls.length,before);
 put('stale','delivery',{patientId:'p',recipient:'parent@example.invalid',status:'Preparado',body:'Revisto'});responseMode='accepted';before=calls.length;
 await assert.rejects(()=>care.sendDelivery(therapist,record('stale'),{...record('p'),version:0}),error=>error.status===409);assert.equal(calls.length,before);assert.equal(record('stale').data.status,'Preparado');

 // Refresh retains the sender identity/scope; a revoked token fails before a
 // delivery is claimed, preserving the reviewed content for later activation.
 let connection=await integration.googleConnection(owner,'gmail');
 await integration.saveGoogleConnection(owner,{...tokens,expiresAt:0},connection.version,'gmail');
 const refreshed=await mail.prepareMail(therapist);
 connection=await integration.googleConnection(owner,'gmail');assert.equal(connection.email,sender);assert.equal(connection.scope,scope);assert.equal(connection.refreshToken,'FAKE_GMAIL_REFRESH');
 await refreshed.send({to:'parent@example.invalid',subject:'Sumário',text:'Revisto',id:'after-refresh'});assert.equal(calls.at(-1).options.headers.Authorization,'Bearer FAKE_REFRESHED_ACCESS');

 // The real scheduler, clinical preparation and Gmail transport work together.
 // The therapist notification contains only the application link and never
 // copies the private child/session/preparation text into an email.
 const tomorrow=nextDay(lisbonNow().date);
 put('t','team',{name:'Terapeuta teste',status:'Ativo',email:'therapist@example.invalid',preparationEmail:'Sim'});
 put('upcoming','appointment',{patientId:'p',therapist:'t',date:tomorrow,time:'10:00',status:'Esperado'});
 put('old-session','session',{patientId:'p',date:lisbonNow().date,status:'Concluída',summary:'PRIVATE_CLINICAL_SUMMARY',nextSteps:'PRIVATE_NEXT_STEPS'});
 sqlite.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').run('member-test',owner.tenant,'t','therapist@example.invalid',1);
 sqlite.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run('first-access:member-test',owner.tenant,'therapist-user','first_professional_access','t','2026-10-08');
 env.CARE_TEAM_EMAIL_ENABLED='true';before=calls.filter(c=>c.url.endsWith('/messages/send')).length;
 await scheduler.runScheduledPreparations(new Date(),'external');
 assert.equal(calls.filter(c=>c.url.endsWith('/messages/send')).length,before+1);
 const notificationMime=Buffer.from(JSON.parse(calls.at(-1).options.body).raw,'base64url').toString('utf8');
 assert.match(notificationMime,/\r\nTo: therapist@example\.invalid\r\n/);
 const notificationText=Buffer.from(notificationMime.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString('utf8');
 assert.match(notificationText,/#preparation/);assert(!notificationText.includes('PRIVATE_CHILD'));assert(!notificationText.includes('PRIVATE_CLINICAL_SUMMARY'));assert(!notificationText.includes('PRIVATE_NEXT_STEPS'));
 await scheduler.runScheduledPreparations(new Date(),'external');
 assert.equal(calls.filter(c=>c.url.endsWith('/messages/send')).length,before+1);

 await integration.saveGoogleConnection(owner,{...tokens,expiresAt:0},connection.version,'gmail');responseMode='revoked';before=calls.length;
 await assert.rejects(()=>care.sendDelivery(therapist,record('stale'),record('p')),error=>error.status===409);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).url,'https://oauth2.googleapis.com/token');assert.equal(record('stale').data.status,'Preparado');
 connection=await integration.googleConnection(owner,'gmail');await integration.saveGoogleConnection(owner,{...tokens,email:'wrong@gmail.com'},connection.version,'gmail');assert.equal(await mail.mailReady(therapist),false);assert.equal(await mail.mailProvider(therapist),'none');

 // Existing Resend installations remain explicit and compatible when no Gmail
 // sender is configured; their documented idempotency key is preserved.
 delete env.GMAIL_SENDER_EMAIL;responseMode='accepted';assert.equal(await mail.mailProvider(therapist),'resend');
 result=await (await mail.prepareMail(therapist)).send({to:'parent@example.invalid',subject:'Sumário',text:'Revisto',id:'resend-test'});
 assert.equal(result.provider,'resend');assert.equal(calls.at(-1).url,'https://api.resend.com/emails');assert.equal(calls.at(-1).options.headers['Idempotency-Key'],'clinic/resend-test');
}finally{globalThis.fetch=originalFetch;sqlite.close();}
console.log('Gmail: clinic sender and tenant isolation, Calendar separation, encrypted provider-bound tokens, UTF-8 MIME/header safety, atomic no-repeat claims, actual scheduler privacy/deduplication, ambiguous transport states, token refresh/revocation and explicit Resend compatibility passed.');
