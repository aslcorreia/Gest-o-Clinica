import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('lib/query-catalog.json','utf8'));
const normal=s=>s.trim().replace(/\s+/g,' '),op=(sql,args)=>{const q=catalog.find(q=>q.sqlite===normal(sql));if(!q)throw Error('Unregistered verification query '+sql);if(q.arity!==args.length)throw Error('Invalid test arguments');return {id:q.id,args};};
const rpc=ops=>'public.linguar_batch('+"'"+JSON.stringify(ops).replaceAll("'","''")+"'::jsonb)",id='postgres-verification',now='2026-10-07T16:00:00Z';
const row=(local,kind,data)=>op('INSERT INTO records (id,clinic,kind,data,author,version,updated) VALUES (?,?,?,?,?,1,?)',[id+':'+local,id,kind,JSON.stringify(data),'verification',now]);
const guardSql="WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)";
const guardedRow=(local,kind,data,source,mutation)=>op('INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? '+guardSql,[id+':'+local,id,kind,JSON.stringify(data),'verification',now,id+':'+source,mutation]);
const initial=[op('INSERT OR IGNORE INTO clinics(id,owner,name,created) VALUES(?,?,?,?)',[id,'verification','Verification only',now]),row('patient','patient',{name:'Fictitious test',age:6,therapist:'owner-profile',shareAuthorized:'Sim',guardianEmail:'parent@example.invalid',status:'Ativo'}),row('appointment','appointment',{patientId:'patient',therapist:'owner-profile',date:'2026-10-07',time:'09:00',duration:45,status:'Esperado'}),row('plan','plan',{patientId:'patient',status:'Ativo',goals:[{id:'goal',name:'Test goal'}]}),row('proposal','plan',{patientId:'patient',status:'Por aprovar',basePlanId:'plan',basePlanVersion:1}),op('INSERT INTO family_access(id,clinic,patient_id,email,enabled,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?) ON CONFLICT(clinic,patient_id,email) DO UPDATE SET enabled=excluded.enabled',[id+':grant',id,'patient','parent@example.invalid',1,now,id+':patient',id,1])];
const checks=" AND EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?)";
const session=[op('INSERT OR IGNORE INTO records(id,clinic,kind,data,author,version,updated) SELECT ?,?,?,?,?,1,? WHERE 1=1'+checks+checks,[id+':session',id,'session',JSON.stringify({patientId:'patient',appointmentId:'appointment',summary:'Test clinical record',internalNote:'Internal',mutationId:'session-operation'}),'verification',now,id+':appointment',id,1,id+':plan',id,1]),op("UPDATE records SET data=json_set(data,'$.status','Concluída'),version=version+1,updated=? WHERE id=? AND clinic=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)",[now,id+':appointment',id,id+':session','session-operation']),guardedRow('session-notice','careNotice',{patientId:'patient',type:'session'},'session','session-operation')];
const stale=[op('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?',[JSON.stringify({mutationId:'stale'}),now,id+':session',id,0]),guardedRow('stale-notice','careNotice',{body:'Must not exist'},'session','stale')];
const revision=[op('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)',[JSON.stringify({patientId:'patient',status:'Ativo',mutationId:'revision'}),now,id+':proposal',1,id+':plan',1]),guardedRow('snapshot','planSnapshot',{originalPlanId:'plan',status:'Ativo'},'proposal','revision'),op("UPDATE records SET data=json_set(data,'$.status','Substituído','$.replacedBy',?),version=version+1,updated=? WHERE id=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)",['proposal',now,id+':plan',id+':proposal','revision'])];
const revoke=[op('UPDATE records SET data=?,version=version+1,updated=? WHERE id=? AND clinic=? AND version=?',[JSON.stringify({name:'Fictitious test',shareAuthorized:'Não',guardianEmail:'parent@example.invalid',mutationId:'revoke'}),now,id+':patient',id,1]),op("UPDATE family_access SET enabled=0 WHERE clinic=? AND patient_id=? AND EXISTS(SELECT 1 FROM records WHERE id=? AND json_extract(data,'$.mutationId')=?)",[id,'patient',id+':patient','revoke'])];
const bad=[row('rollback','patient',{name:'Must not persist'}),{id:'unknown-query',args:[]}];
const assert=(condition,message)=>`IF NOT (${condition}) THEN RAISE EXCEPTION '${message}'; END IF;`;
const sql=`BEGIN;
SET LOCAL ROLE service_role;
DO $verification$ DECLARE result jsonb; caught boolean:=false; BEGIN
 PERFORM ${rpc(initial)};
 result:=${rpc(session)};
 ${assert("result->0->'meta'->>'changes'='1'",'Session was not saved')}
 ${assert("(SELECT data::jsonb->>'status' FROM public.records WHERE id='"+id+":appointment')='Concluída'",'Appointment did not finish')}
 result:=${rpc(stale)};
 ${assert("result->0->'meta'->>'changes'='0'",'Stale write was accepted')}
 ${assert("NOT EXISTS(SELECT 1 FROM public.records WHERE id='"+id+":stale-notice')",'Stale write left a notification')}
 PERFORM ${rpc(revision)};
 ${assert("EXISTS(SELECT 1 FROM public.records WHERE id='"+id+":snapshot') AND (SELECT data::jsonb->>'status' FROM public.records WHERE id='"+id+":plan')='Substituído'",'Plan revision was partial')}
 PERFORM ${rpc(revoke)};
 ${assert("(SELECT enabled FROM public.family_access WHERE id='"+id+":grant')=0",'Consent did not revoke access')}
 BEGIN PERFORM ${rpc(bad)}; EXCEPTION WHEN OTHERS THEN caught:=true; END;
 ${assert('caught','Invalid query did not fail')}
 ${assert("NOT EXISTS(SELECT 1 FROM public.records WHERE id='"+id+":rollback')",'Failed transaction left a patient')}
END $verification$;
ROLLBACK;
SELECT 'sessions, stale writes, plan revisions, consent revocation and transaction rollback passed' AS verification,
 (SELECT count(*) FROM public.records) AS persistent_patient_data;
`;
fs.writeFileSync('supabase/verify-transactions.sql',sql);console.log('Postgres transaction verification generated');
