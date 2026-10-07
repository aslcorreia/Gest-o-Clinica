import {sampleRecords,type Rec} from './model';

// Identify untouched fixtures from the original seed by provenance, ID and kind.
// Never delete or overwrite a record when separating training from daily work.
const legacyKinds=new Map(sampleRecords('2000-01-01').map(r=>[r.id,r.kind]));
export function tagExampleRecords(rows:Rec[]):Rec[]{
 const examples=new Set(rows.filter(r=>r.data.isTest===true||r.author==='t1'&&r.version===1&&legacyKinds.get(r.id)===r.kind).map(r=>r.id));
 let changed=true;
 while(changed){changed=false;for(const r of rows){if(!examples.has(r.id)&&['patientId','appointmentId','sessionId','planId','basePlanId','deliveryId'].some(k=>examples.has(r.data[k]))){examples.add(r.id);changed=true;}}}
 return rows.map(r=>examples.has(r.id)?{...r,data:{...r.data,isTest:true}}:r);
}
export function dailyRecords(rows:Rec[]){
 const real=rows.filter(r=>r.data.isTest!==true),shared=new Set<string>();
 for(const r of real)for(const key of ['therapist','room','school','equipmentId','courseId','protocolId'])if(r.data[key])shared.add(r.data[key]);
 return rows.filter(r=>r.data.isTest!==true||['team','room','school','equipment','course','material'].includes(r.kind)&&shared.has(r.id));
}
