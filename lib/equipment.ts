import type {Rec} from './model';
import type {Access} from './access';

export function equipmentUseAllowed(record:Rec,access:Pick<Access,'role'|'therapist'>):boolean {
 if(!['director','therapist'].includes(access.role))return false;
 return record.data.status==='Disponível'&&!record.data.holder||record.data.status==='Em uso'&&(access.role==='director'||record.data.holder===access.therapist);
}

export function equipmentUseRecord(record:Rec,therapist:string):Rec&{action:'equipmentUse'} {
 const returning=record.data.status==='Em uso';
 return {...record,action:'equipmentUse',data:{...record.data,status:returning?'Disponível':'Em uso',holder:returning?'':therapist}};
}

// A professional may only pick up a free item or return their own item. The generic
// permission to edit inventory remains director-only; these are narrow transitions.
export function normalizeEquipmentMutation(record:Rec,previous:Rec|undefined,rows:Rec[],access:Access,now=new Date().toISOString()):void {
 const data=record.data,fail=(message:string):never=>{throw Error(message)};
 if(!['Disponível','Em uso','Manutenção'].includes(data.status))fail('Estado do equipamento inválido.');
 if(!String(data.name||'').trim())fail('Preencha o nome do equipamento.');
 if(access.role!=='director'){
  if(access.role!=='therapist'||!previous)fail('Só a direção pode criar ou editar equipamentos.');
  const before=previous!.data,allowed=new Set(['status','holder','checkoutAt']);
  for(const key of new Set([...Object.keys(before),...Object.keys(data)]))if(!allowed.has(key)&&JSON.stringify(before[key])!==JSON.stringify(data[key]))fail('Só pode levantar ou devolver o equipamento; os dados do inventário pertencem à direção.');
  const pickup=before.status==='Disponível'&&!before.holder&&data.status==='Em uso'&&data.holder===access.therapist;
  const dropoff=before.status==='Em uso'&&before.holder===access.therapist&&data.status==='Disponível'&&!data.holder;
  if(!pickup&&!dropoff)fail('Equipamento indisponível ou atribuído a outra pessoa.');
 }
 if(data.status==='Em uso'){
  data.holder=data.holder||access.therapist;
  if(!rows.some(r=>r.kind==='team'&&r.id===data.holder&&!['Inativo','Arquivado','Ausente'].includes(r.data.status)))fail('Escolha um responsável ativo para o equipamento.');
  data.checkoutAt=previous?.data.status==='Em uso'&&previous.data.holder===data.holder?previous.data.checkoutAt||now:now;
 }else{
  data.holder='';data.checkoutAt='';
 }
}
