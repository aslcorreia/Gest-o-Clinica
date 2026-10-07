'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Card,Pick,Empty,Badge,usePro,uid} from './shared';
import {guardians,familyKey,patientAge,type Guardian} from '@/lib/patients';
import type {Rec} from '@/lib/model';

export function PatientFields({record,data,change}:{record:Rec;data:Record<string,any>;change:(data:Record<string,any>)=>void}){
 const p=usePro(),contacts=guardians(data);
 const families=[...new Map(p.records.filter(r=>r.kind==='patient'&&r.id!==record.id).map(r=>[familyKey(r),r])).values()];
 const update=(key:string,value:any)=>change({...data,[key]:value});
 const editGuardian=(id:string,patch:Partial<Guardian>)=>update('guardians',contacts.map(g=>g.id===id?{...g,...patch}:g));
 function selectFamily(key:string){
  const sibling=families.find(r=>familyKey(r)===key);
  change({...data,familyId:key||record.id,familyName:sibling?.data.familyName||'',...(!record.version&&!contacts.length&&sibling?{guardians:guardians(sibling.data).map(g=>({...g,id:uid(),shareAuthorized:'Não',consentNote:'',consentAt:undefined,consentBy:undefined}))}:{})});
 }
 return <div className="patient-intake">
  <fieldset><legend>Identificação da criança</legend><div className="form-grid">
   <label>Nome completo *<Input required maxLength={160} autoComplete="off" value={data.name||''} onChange={e=>update('name',e.target.value)}/></label>
   <label>Data de nascimento<Input type="date" max={new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon'}).format(new Date())} value={data.birthDate||''} onChange={e=>update('birthDate',e.target.value)}/></label>
   {!data.birthDate&&<label>Idade (se souber)<Input type="number" min={0} max={120} value={data.age??''} onChange={e=>update('age',e.target.value===''?'':Number(e.target.value))}/></label>}
   <label>Terapeuta responsável{!p.director?' *':''}<Pick label="Terapeuta responsável" value={data.therapist} change={(v:string)=>update('therapist',v)} options={p.records.filter(r=>r.kind==='team'&&!['Inativo','Arquivado'].includes(r.data.status)&&(p.director||r.id===p.me)).map(r=>({value:r.id,label:r.data.name}))}/></label>
   <label>Estado<Pick value={data.status||'Ativo'} change={(v:string)=>update('status',v)} options={['Ativo','Arquivado']}/></label>
   <label>Início do acompanhamento<Input type="date" value={data.startDate||''} onChange={e=>update('startDate',e.target.value)}/></label>
   <label>Fim do acompanhamento<Input type="date" value={data.endDate||''} onChange={e=>update('endDate',e.target.value)}/></label>
  </div><p className="small">Pode completar a data de nascimento ou a idade mais tarde.{p.director?' Os acompanhamentos sem terapeuta ficam disponíveis apenas à direção até serem atribuídos.':''}</p></fieldset>
  <fieldset><legend>Família e responsáveis</legend><div className="form-grid">
   <label>Associar a uma família já registada<Pick label="Família existente" value={data.familyId===record.id?'':data.familyId||''} change={selectFamily} options={families.map(r=>({value:familyKey(r),label:(r.data.familyName||'Família de '+r.data.name)+' · '+r.data.name}))}/></label>
   <label>Nome da família (opcional)<Input maxLength={160} value={data.familyName||''} placeholder="Nome para identificar a família" onChange={e=>update('familyName',e.target.value)}/></label>
  </div><p className="small">A autorização é registada por criança e por responsável. Associar irmãos não partilha notas nem ativa acessos.</p>
  {contacts.map((g,i)=><section className="detail-box" key={g.id}><div className="filter-row"><h3>{i===0?'Contacto principal':'Responsável '+(i+1)}</h3><Button type="button" variant="ghost" onClick={()=>update('guardians',contacts.filter(x=>x.id!==g.id))}>Remover responsável</Button></div><div className="form-grid">
   <label>Nome *<Input required maxLength={160} value={g.name} onChange={e=>editGuardian(g.id,{name:e.target.value})}/></label>
   <label>Relação com a criança<Input maxLength={80} value={g.relationship} placeholder="Mãe, pai, tutor…" onChange={e=>editGuardian(g.id,{relationship:e.target.value})}/></label>
   <label>Email<Input type="email" maxLength={254} value={g.email} onChange={e=>editGuardian(g.id,{email:e.target.value})}/></label>
   <label>Telefone<Input type="tel" maxLength={60} value={g.phone} onChange={e=>editGuardian(g.id,{phone:e.target.value})}/></label>
   <label>Partilha autorizada com este responsável<Pick label={'Autorização de '+(g.name||'responsável')} value={g.shareAuthorized} change={(v:string)=>editGuardian(g.id,{shareAuthorized:v})} options={['Não','Sim']}/></label>
   <label>Referência da autorização<Input maxLength={2000} value={g.consentNote||''} placeholder="Data ou documento que suporta a autorização" onChange={e=>editGuardian(g.id,{consentNote:e.target.value})}/></label>
  </div></section>)}
  <Button type="button" variant="outline" disabled={contacts.length>=8} onClick={()=>update('guardians',[...contacts,{id:uid(),name:'',relationship:'Responsável',email:'',phone:'',shareAuthorized:'Não',consentNote:''}])}>Adicionar responsável</Button>
  <p className="small">A direção ativa o painel de cada responsável na Área dos pais, após guardar a ficha.</p>
  </fieldset>
  <fieldset><legend>Acompanhamento e contactos de apoio</legend><div className="form-grid">
   {data.followUpStatus&&<p className="full small">Estado no registo de origem: {data.followUpStatus}</p>}
   <label className="full">Notas do acompanhamento<Textarea maxLength={20000} value={data.notes||''} onChange={e=>update('notes',e.target.value)}/></label>
   <label className="full">Motivo do acompanhamento / hipótese de diagnóstico<Textarea value={data.diagnosis||''} onChange={e=>update('diagnosis',e.target.value)}/></label>
   <label className="full">Metas iniciais<Textarea value={data.objectives||''} onChange={e=>update('objectives',e.target.value)}/></label>
   <label>Escola<Input value={data.school||''} onChange={e=>update('school',e.target.value)}/></label>
   <label>Contacto de emergência<Input value={data.emergency||''} onChange={e=>update('emergency',e.target.value)}/></label>
   <label>Professor / contacto<Input value={data.teacher||''} onChange={e=>update('teacher',e.target.value)}/></label>
   <label>Direção da escola / contacto<Input value={data.schoolDirector||''} onChange={e=>update('schoolDirector',e.target.value)}/></label>
   <label className="full">Adultos autorizados a acompanhar ou recolher a criança<Textarea value={data.authorizedAdults||''} onChange={e=>update('authorizedAdults',e.target.value)}/></label>
   <label>Necessita de avaliação<Pick value={data.needsAssessment||'Não'} change={(v:string)=>update('needsAssessment',v)} options={['Não','Sim']}/></label>
  </div></fieldset>
 </div>;
}

export function PatientContacts({patient}:{patient:Rec}){
 const p=usePro(),siblings=p.records.filter(r=>r.kind==='patient'&&r.id!==patient.id&&familyKey(r)===familyKey(patient));
 return <Card title={patient.data.familyName||'Família e contactos'} actions={<Button variant="outline" onClick={()=>p.open('patient',patient)}>Editar cadastro</Button>}>
  {guardians(patient.data).map(g=><article className="detail-box" key={g.id}><h3>{g.name} <Badge>{g.relationship}</Badge></h3><p>{g.email||'Sem email'} · {g.phone||'Sem telefone'}</p><p className="small">Partilha autorizada: {g.shareAuthorized}{g.consentNote?' · '+g.consentNote:''}</p></article>)}
  {!guardians(patient.data).length&&<Empty>Adicione os responsáveis desta criança.</Empty>}
  {patient.data.followUpStatus&&<p>Estado no registo de origem: {patient.data.followUpStatus}</p>}
  {patient.data.notes&&<section className="detail-box"><h3>Notas do acompanhamento</h3><p className="pre-wrap">{patient.data.notes}</p></section>}
  <p>Escola: {patient.data.school||'Por preencher'}</p><p>Emergência: {patient.data.emergency||'Por preencher'}</p>
  {!!siblings.length&&<><h3>Outras crianças desta família</h3><div className="actions">{siblings.map(r=><Button variant="outline" key={r.id} onClick={()=>p.patient(r)}>{r.data.name}</Button>)}</div></>}
 </Card>;
}

export function FamiliesDirectory(){
 const p=usePro(),[query,setQuery]=useState('');
 const patients=p.records.filter(r=>r.kind==='patient'&&r.data.status!=='Arquivado');
 const groups=new Map<string,Rec[]>();for(const r of patients){const key=familyKey(r);groups.set(key,[...(groups.get(key)||[]),r]);}
 const list=[...groups.entries()].filter(([,children])=>children.some(r=>[r.data.name,r.data.familyName,...guardians(r.data).flatMap(g=>[g.name,g.email,g.phone])].join(' ').toLocaleLowerCase('pt').includes(query.toLocaleLowerCase('pt'))));
 return <><Card title="Crianças e famílias" sub={patients.length+' crianças em acompanhamento · '+groups.size+' famílias'} actions={<Button onClick={()=>p.open('patient')}>Adicionar criança e família</Button>}><Input aria-label="Pesquisar famílias" placeholder="Nome da criança, responsável, email ou telefone" value={query} onChange={e=>setQuery(e.target.value)}/><p className="small">Os cadastros ficam guardados na clínica. Abra a ficha para agendar sessões, criar o plano e ativar o acesso dos responsáveis.</p></Card>
  {list.map(([key,children])=><Card key={key} title={children.find(r=>r.data.familyName)?.data.familyName||'Família de '+children[0].data.name} actions={<Button variant="outline" onClick={()=>p.open('patient',undefined,{familyId:key,familyName:children[0].data.familyName||'',guardians:guardians(children[0].data).map(g=>({...g,id:uid(),shareAuthorized:'Não',consentNote:'',consentAt:undefined,consentBy:undefined}))})}>Adicionar outra criança</Button>}>
   {children.map(r=><article className="detail-box" key={r.id}><div className="filter-row"><h3>{r.data.name}</h3><Badge>{patientAge(r.data)===null?'Idade por preencher':patientAge(r.data)+' anos'}</Badge></div><p>{p.records.find(t=>t.id===r.data.therapist)?.data.name||'Terapeuta por atribuir'}</p><p className="small">{guardians(r.data).map(g=>g.name+' ('+g.relationship+')').join(' · ')||'Responsáveis por preencher'}</p><div className="actions"><Button onClick={()=>p.patient(r)}>Abrir acompanhamento</Button><Button variant="outline" onClick={()=>p.open('patient',r)}>Editar cadastro</Button><Button variant="outline" onClick={()=>p.open('appointment',undefined,{patientId:r.id,therapist:r.data.therapist})}>Agendar sessão</Button></div></article>)}
  </Card>)}
  {!list.length&&<Empty>{query?'Não foram encontradas famílias.':'Comece por adicionar a primeira criança e os seus responsáveis.'}</Empty>}
 </>;
}
