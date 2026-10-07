import type {Rec} from './model';

const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
const activeBooking=(data:Record<string,any>)=>!['Cancelada','Falta'].includes(data.status);
export function validScheduleDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

// Use only explicitly recorded working days/times. Weekly hours alone are not a schedule.
export function appointmentAvailability(rows:Rec[],data:Record<string,any>,id=''):string|null {
 if(!validScheduleDate(data.date)||!timePattern.test(String(data.time||'')))return 'Data ou hora inválida.';
 const start=minutes(data.time),duration=Number(data.duration);
 if(!Number.isFinite(duration)||duration<=0||start+duration>1440)return 'Duração inválida ou sessão para além do final do dia.';
 if(!activeBooking(data))return null;
 const therapist=rows.find(r=>r.kind==='team'&&r.id===data.therapist);
 if(!therapist)return 'Escolha uma terapeuta válida.';
 if(['Inativo','Arquivado','Ausente'].includes(therapist.data.status))return 'A terapeuta está inativa ou indisponível.';
 if(validScheduleDate(therapist.data.startDate)&&data.date<therapist.data.startDate)return 'A sessão é anterior ao início de funções da terapeuta.';
 if(rows.some(r=>r.kind==='leave'&&r.data.therapist===data.therapist&&r.data.status==='Aprovado'&&r.data.date<=data.date&&r.data.endDate>=data.date))return 'A terapeuta tem uma ausência aprovada nesta data.';
 const days=String(therapist.data.workDays??'').trim();
 if(/^[0-6](,[0-6])*$/.test(days)&&!days.split(',').map(Number).includes(new Date(data.date+'T12:00:00Z').getUTCDay()))return 'Este dia não consta dos dias de trabalho da terapeuta.';
 if(timePattern.test(therapist.data.startTime||'')&&start<minutes(therapist.data.startTime))return 'A sessão começa antes do horário de entrada da terapeuta.';
 if(timePattern.test(therapist.data.endTime||'')&&start+duration>minutes(therapist.data.endTime))return 'A sessão termina depois do horário de saída da terapeuta.';
 const roomId=data.context==='Clínica'||!data.context?data.room:'';
 if(data.context==='Clínica'&&!roomId)return 'Escolha uma sala.';
 if(roomId){
  const room=rows.find(r=>r.kind==='room'&&r.id===roomId);
  if(!room||['Indisponível','Manutenção','Arquivado'].includes(room.data.status))return 'A sala está indisponível. Escolha outra sala.';
 }
 if(rows.some(r=>r.kind==='appointment'&&r.id!==(id||data.id)&&r.data.date===data.date&&activeBooking(r.data)&&(r.data.therapist===data.therapist||data.patientId&&r.data.patientId===data.patientId||roomId&&r.data.room===roomId&&(!r.data.context||r.data.context==='Clínica'))&&minutes(r.data.time)<start+duration&&minutes(r.data.time)+Number(r.data.duration)>start))return 'Existe uma sobreposição de paciente, terapeuta ou sala.';
 return null;
}

// A historical status update must remain possible after a professional leaves or a room closes.
export function requiresAvailabilityCheck(data:Record<string,any>,previous?:Record<string,any>):boolean {
 return activeBooking(data)&&(!previous||!activeBooking(previous)||['date','time','duration','therapist','patientId','context','room'].some(key=>String(data[key]??'')!==String(previous[key]??'')));
}
