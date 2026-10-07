import type {Rec} from './model';
export type Access={role:string;user:{userId:string};therapist:string};
const adminKinds=['invoice','team','room','school','settings','subscription','survey','channel','communicationTemplate','campaign','communicationRule'];
const privateKinds=['preference','wellbeing','courseProgress'];
export function channelVisible(id:string,a:Access,rows:Rec[]){if(['geral','casos-clínicos','materiais'].includes(id))return true;const c=rows.find(r=>r.kind==='channel'&&r.id===id);return !!c&&(a.role==='director'||c.data.private!=='Sim'||c.data.members?.includes(a.therapist))}
export function messageVisible(r:Rec,a:Access,rows:Rec[]){return r.data.dm?r.data.members?.includes(a.therapist)===true:channelVisible(r.data.channel,a,rows)}
export function visible(r:Rec,a:Access,rows:Rec[]):boolean{
 if(a.role==='parent')return false;
 if(r.kind==='careNotice')return a.role==='director'||!r.data.directorOnly&&r.data.therapist===a.therapist&&(!r.data.appointmentId||rows.some(ap=>ap.id===r.data.appointmentId&&ap.data.therapist===a.therapist))&&(!r.data.patientId||rows.some(p=>p.kind==='patient'&&p.id===r.data.patientId&&p.data.therapist===a.therapist));
 if(privateKinds.includes(r.kind))return r.author===a.user.userId;
 if(r.kind==='message')return messageVisible(r,a,rows);
 if(r.kind==='file'&&r.data.visibility==='Pessoal')return r.author===a.user.userId||rows.some(m=>m.kind==='message'&&m.data.attachment===r.id&&messageVisible(m,a,rows));
 if(r.kind==='channel')return channelVisible(r.id,a,rows);
 if(a.role==='director')return true;
 if(adminKinds.includes(r.kind))return ['team','room','school'].includes(r.kind);
 if(r.kind==='trainingEnrollment')return r.data.therapist===a.therapist;
 if(r.kind==='patient')return r.data.therapist===a.therapist;
 if(r.data.patientId)return rows.some(p=>p.id===r.data.patientId&&p.kind==='patient'&&p.data.therapist===a.therapist);
 if(r.kind==='communication'&&!r.data.patientId)return r.author===a.user.userId;
 if(['attendance','leave','visit','feedback'].includes(r.kind))return r.data.therapist===a.therapist;
 if(['delivery','sessionAmendment','planSnapshot','session','plan','report','prescription','exerciseResult','autonomousSession','assessment','document','notebook','referral'].includes(r.kind))return false;
 return true;
}
export function mayWrite(kind:string,a:Access){return a.role!=='parent'&&!['familyPublication','familyMessage','familyRequest','familyRead','file','careNotice','delivery','sessionAmendment','planSnapshot'].includes(kind)&&(a.role==='director'||![...adminKinds,'alert','material','course','equipment'].includes(kind))}
export function professionalProjection(r:Rec,a:Access):Rec{
 if(a.role==='therapist'&&r.kind==='team'&&r.id!==a.therapist)return {...r,data:{name:r.data.name,specialty:r.data.specialty,status:r.data.status,isTest:r.data.isTest===true}};
 return r;
}
