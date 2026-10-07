import type {Rec} from './model';

export type Guardian={id:string;name:string;relationship:string;email:string;phone:string;shareAuthorized:string;consentNote:string;consentAt?:string;consentBy?:string};
export const normalizeEmail=(value:unknown)=>String(value||'').trim().toLowerCase();
export function guardians(data:Record<string,any>):Guardian[]{
 if(Array.isArray(data.guardians))return data.guardians;
 return data.guardian||data.guardianEmail||data.contact?[{id:'primary',name:data.guardian||'',relationship:'Responsável',email:normalizeEmail(data.guardianEmail),phone:data.contact||'',shareAuthorized:data.shareAuthorized==='Sim'?'Sim':'Não',consentNote:''}]:[];
}
export const familyKey=(p:Rec)=>String(p.data.familyId||p.id);
export function ageAt(birthDate:string,date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date())){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(Date.parse(birthDate))||new Date(birthDate).toISOString().slice(0,10)!==birthDate||birthDate>date)return null;
 const age=Number(date.slice(0,4))-Number(birthDate.slice(0,4))-(date.slice(5)<birthDate.slice(5)?1:0);
 return age>=0&&age<=120?age:null;
}
export function patientAge(data:Record<string,any>){return data.birthDate?ageAt(data.birthDate):data.age??null}

// Contacts belong to each child's record: linking siblings never transfers consent.
export function normalizePatient(r:Rec,prev:Rec|undefined,rows:Rec[],actor:string){
 const d=r.data,fail=(message:string):never=>{throw Error(message)};
 if(d.birthDate){const age=ageAt(d.birthDate);if(age===null)fail('Data de nascimento inválida.');d.age=age;}
 if(!['Ativo','Arquivado'].includes(d.status||'Ativo'))fail('Estado do acompanhamento inválido.');
 d.name=String(d.name||'').trim();if(d.name.length>160)fail('Nome demasiado longo.');
 const key=String(d.familyId||prev?.data.familyId||r.id);
 if(!/^[\w-]{1,120}$/.test(key))fail('Família inválida.');
 if(key!==r.id&&key!==String(prev?.data.familyId||'')&&!rows.some(p=>p.kind==='patient'&&familyKey(p)===key))fail('Selecione uma família disponível.');
 d.familyId=key;d.familyName=String(d.familyName||'').trim().slice(0,160);
 if(prev?.data.guardians&&!Array.isArray(d.guardians))fail('Atualize a ficha antes de alterar os responsáveis.');
 if(d.guardians!==undefined){
  if(!Array.isArray(d.guardians)||d.guardians.length>8)fail('Pode registar até oito responsáveis.');
  const seen=new Set<string>(),ids=new Set<string>(),previous=guardians(prev?.data||{});
  d.guardians=d.guardians.map((g:any)=>{
   if(!g||typeof g!=='object'||typeof g.id!=='string'||!/^[\w-]{1,120}$/.test(g.id)||ids.has(g.id))fail('Responsável inválido.');ids.add(g.id);
   const name=String(g.name||'').trim(),email=normalizeEmail(g.email),phone=String(g.phone||'').trim(),relationship=String(g.relationship||'Responsável').trim();
   if(!name||name.length>160||phone.length>60||relationship.length>80)fail('Preencha o nome e reveja os contactos do responsável.');
   if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))fail('Email do responsável inválido.');
   if(email&&seen.has(email))fail('O mesmo email está repetido nos responsáveis.');if(email)seen.add(email);
   if(!['Sim','Não'].includes(g.shareAuthorized))fail('Confirme a autorização de cada responsável.');
   if(g.shareAuthorized==='Sim'&&!email)fail('Indique o email para autorizar a partilha.');
   const consentNote=String(g.consentNote||'').trim();if(consentNote.length>2000)fail('Nota de autorização demasiado longa.');
   const old=previous.find(x=>x.id===g.id),changed=!old||old.email!==email||old.shareAuthorized!==g.shareAuthorized||old.consentNote!==consentNote;
   return {id:g.id,name,relationship,email,phone,shareAuthorized:g.shareAuthorized,consentNote,consentAt:changed?new Date().toISOString():old?.consentAt,consentBy:changed?actor:old?.consentBy};
  });
  const primary=d.guardians[0];d.guardian=primary?.name||'';d.guardianEmail=primary?.email||'';d.contact=primary?.phone||'';d.shareAuthorized=primary?.shareAuthorized||'Não';
 }
 if(d.birthDate&&rows.some(p=>p.kind==='patient'&&p.id!==r.id&&p.data.birthDate===d.birthDate&&String(p.data.name||'').trim().toLocaleLowerCase('pt')===d.name.toLocaleLowerCase('pt')))fail('Já existe uma ficha com este nome e data de nascimento. Abra a ficha existente.');
}
