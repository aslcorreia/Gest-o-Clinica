const statuses:Record<string,string>={'email.sent':'Aceite pelo serviço','email.delivered':'Entregue','email.delivery_delayed':'Entrega atrasada','email.bounced':'Devolvido','email.failed':'Falhou','email.complained':'Queixa de spam'};
export function emailEventStatus(type:string){return statuses[type]||'';}
export function shouldApplyEmailEvent(data:Record<string,any>,type:string,date:string){if(!emailEventStatus(type)||!Number.isFinite(Date.parse(date)))return false;if(data.emailEventAt&&Date.parse(date)<Date.parse(data.emailEventAt))return false;const terminal=['Entregue','Devolvido','Falhou','Queixa de spam'];return !terminal.includes(data.status)||!['email.sent','email.delivery_delayed'].includes(type);}
export async function verifyEmailWebhook(body:string,headers:Headers,secret:string,now=Date.now()){
 const id=headers.get('svix-id')||'',timestamp=headers.get('svix-timestamp')||'',signature=headers.get('svix-signature')||'';
 if(!id||id.length>160||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!secret.startsWith('whsec_'))throw Error('Invalid webhook');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const data=new TextEncoder().encode(id+'.'+timestamp+'.'+body);let valid=false;
 for(const part of signature.split(' ')){if(!part.startsWith('v1,'))continue;try{if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(part.slice(3)),c=>c.charCodeAt(0)),data))valid=true}catch{}}
 if(!valid)throw Error('Invalid webhook');return {id,event:JSON.parse(body)};
}
