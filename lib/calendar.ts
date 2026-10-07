import type {Rec} from './model';
import type {Access} from './access';
import {validScheduleDate} from './scheduling';

export function videoUrl(value:unknown):string {
 if(!value)return '';
 try{const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password||u.port)return '';const allowed=['meet.google.com','zoom.us','teams.microsoft.com','teams.live.com','whereby.com'];if(!allowed.some(h=>u.hostname===h||h==='zoom.us'&&u.hostname.endsWith('.zoom.us')))return '';return u.href}catch{return ''}
}
export function calendarAppointments(rows:Rec[],a:Pick<Access,'role'|'therapist'>){return rows.filter(r=>r.kind==='appointment'&&(a.role==='director'||r.data.therapist===a.therapist&&rows.some(p=>p.kind==='patient'&&p.id===r.data.patientId&&p.data.therapist===a.therapist)));}
export function appointmentTimes(data:Record<string,any>){
 if(!validScheduleDate(data.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))throw Error('Data ou hora inválida.');
 const duration=Number(data.duration),start=Number(data.time.slice(0,2))*60+Number(data.time.slice(3));
 if(!Number.isFinite(duration)||duration<1||duration>480||start+duration>1440)throw Error('Duração inválida.');
 const end=new Date(data.date+'T00:00:00Z');end.setUTCMinutes(start+duration);
 return {start:data.date+'T'+data.time+':00',end:end.toISOString().slice(0,19)};
}
const escapeIcs=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
// Fold by UTF-8 octets, preserving characters, as required by RFC 5545.
export function foldIcs(line:string){let result='',part='';for(const c of line){if(new TextEncoder().encode(part+c).length>73){result+=part+'\r\n ';part=''}part+=c}return result+part;}
export function calendarIcs(rows:Rec[],namespace:string){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Bem Crescer//Agenda//PT','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VTIMEZONE','TZID:Europe/Lisbon','BEGIN:STANDARD','DTSTART:19701025T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','BEGIN:DAYLIGHT','DTSTART:19700329T010000','TZOFFSETFROM:+0000','TZOFFSETTO:+0100','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','END:VTIMEZONE'];
 for(const r of rows){if(['Falta','Remarcada'].includes(r.data.status))continue;let times;try{times=appointmentTimes(r.data)}catch{continue}
  lines.push('BEGIN:VEVENT','UID:'+escapeIcs(namespace+'-'+r.id)+'@bem-crescer','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z'),'SEQUENCE:'+r.version,'DTSTART;TZID=Europe/Lisbon:'+times.start.replace(/[-:]/g,''),'DTEND;TZID=Europe/Lisbon:'+times.end.replace(/[-:]/g,''),'SUMMARY:Bem Crescer — Sessão','DESCRIPTION:Consulte os detalhes na aplicação Bem Crescer.','CLASS:PRIVATE','STATUS:'+(r.data.status==='Cancelada'?'CANCELLED':'CONFIRMED'));
  const url=videoUrl(r.data.videoUrl);if(url&&r.data.context==='Online'&&!['Cancelada','Remarcada','Falta'].includes(r.data.status))lines.push('URL:'+escapeIcs(url));lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(foldIcs).join('\r\n')+'\r\n';
}
export function googleEvent(data:Record<string,any>,meet=false){const times=appointmentTimes(data);return {summary:'Bem Crescer — Sessão',description:'Consulte os detalhes clínicos na aplicação Bem Crescer.',start:{dateTime:times.start,timeZone:'Europe/Lisbon'},end:{dateTime:times.end,timeZone:'Europe/Lisbon'},visibility:'private',transparency:'opaque',...(meet?{conferenceData:{createRequest:{requestId:crypto.randomUUID(),conferenceSolutionKey:{type:'hangoutsMeet'}}}}:{})};}
