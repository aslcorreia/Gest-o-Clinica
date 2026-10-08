import {env} from 'cloudflare:workers';
import {db,AppError,type Identity} from './server';
import {googleReady,googleConnection,googleToken} from './integrations-server';

export const gmailSender=()=>String((env as any).GMAIL_SENDER_EMAIL||'').trim().toLowerCase();
const address=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
export const gmailReady=()=>googleReady()&&address.test(gmailSender());
export async function clinicMailIdentity(a:Identity){const clinic=await db().prepare('SELECT owner FROM clinics WHERE id=?').bind(a.tenant).first<{owner:string}>();if(!clinic)throw new AppError('Clínica indisponível.',409);return {...a,user:{...a.user,userId:clinic.owner}};}
export async function gmailConnection(a:Identity){if(!gmailSender())return null;const connection=await googleConnection(await clinicMailIdentity(a),'gmail');return connection&&connection.email===gmailSender()&&String(connection.scope).split(' ').includes('https://www.googleapis.com/auth/gmail.send')?connection:null;}
export async function mailProvider(a:Identity):Promise<'gmail'|'resend'|'none'>{if(gmailSender())return gmailReady()&&await gmailConnection(a)?'gmail':'none';return (env as any).RESEND_API_KEY&&(env as any).MAIL_FROM?'resend':'none';}
export const mailReady=async(a:Identity)=>(await mailProvider(a))!=='none';

const base64=(bytes:Uint8Array)=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw)};
const utf8=(value:string)=>new TextEncoder().encode(value);
type Mail={to:string;subject:string;text:string;id:string};
export async function gmailMime(message:Mail&{from:string}){const {from,to,subject,text,id}=message;if(!address.test(from)||!address.test(to)||/[\r\n]/.test(from+to+subject+id)||!subject.trim()||id.length>500||text.length>1000000)throw new AppError('Email inválido. Confirme o destinatário e o conteúdo.');const digest=await crypto.subtle.digest('SHA-256',utf8(id)),messageId=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');const subjectParts:string[]=[];let part='';for(const char of subject){if(utf8(part+char).length>30){subjectParts.push('=?UTF-8?B?'+base64(utf8(part))+'?=');part=''}part+=char}if(part)subjectParts.push('=?UTF-8?B?'+base64(utf8(part))+'?=');const body=base64(utf8(text.replace(/\r?\n/g,'\r\n'))).match(/.{1,76}/g)?.join('\r\n')||'';const mime=['From: Bem Crescer <'+from+'>','To: '+to,'Subject: '+subjectParts.join('\r\n '),'Date: '+new Date().toUTCString(),'Message-ID: <'+messageId+'@bem-crescer.invalid>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+body].join('\r\n');return base64(utf8(mime)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

// Acquire credentials before an immutable send claim. A timeout after the POST
// is ambiguous and is never retried automatically: Gmail has no idempotency key.
export async function prepareMail(a:Identity){const provider=await mailProvider(a);if(provider==='none')throw new AppError('O email da clínica ainda precisa de ser autorizado. Pode partilhar o texto revisto manualmente.',503);const token=provider==='gmail'?await googleToken(await clinicMailIdentity(a),'gmail'):String((env as any).RESEND_API_KEY);
 return {provider,async send(message:Mail){
  let status='Resultado desconhecido',providerId='';
  try{
   const body=provider==='gmail'?JSON.stringify({raw:await gmailMime({...message,from:gmailSender()})}):JSON.stringify({from:(env as any).MAIL_FROM,to:[message.to],subject:message.subject,text:message.text});
   const response=await fetch(provider==='gmail'?'https://gmail.googleapis.com/gmail/v1/users/me/messages/send':'https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(provider==='resend'?{'Idempotency-Key':a.tenant+'/'+message.id}:{})},body,signal:AbortSignal.timeout(15000)});
   if(!response.ok&&response.status<500)status='Falhou';
   const result:any=await response.json();
   if(response.ok&&typeof result.id==='string'){status='Aceite pelo serviço';providerId=result.id}
  }catch(e){if(e instanceof AppError)status='Falhou'}
  return {status,providerId,provider};
 }};
}
