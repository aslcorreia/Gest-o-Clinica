import {z} from 'zod';
import {authorizedEmail,setSession,verifiedUser,returnPath,landingPath} from '@/lib/auth';
import {authRequest} from '@/lib/supabase-http';
import {checkOrigin,failure,AppError} from '@/lib/server';
const input=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(256).optional(),next:z.string().optional()});
export async function POST(req:Request){try{
 checkOrigin(req);const x=input.parse(await req.json()),email=x.email.toLowerCase();
 if(!await authorizedEmail(email))throw new AppError('Este email ainda não tem acesso. Peça à clínica para o autorizar.',403);
 const redirect=new URL('/auth/confirm',req.url);let next=returnPath(x.next);
 const r=x.password?await authRequest('token?grant_type=password',{email,password:x.password}):await authRequest('otp?redirect_to='+encodeURIComponent(redirect.href),{email,create_user:true});
 if(!r.ok)throw new AppError(x.password?'Email ou palavra-passe inválidos.':'Não foi possível enviar o link. Aguarde um minuto e tente novamente.',r.status===429?429:400);
 if(x.password){const session:any=await r.json(),u=await verifiedUser(session.access_token);if(!u||u.email!==email)throw new AppError('Confirme o seu email para entrar.',401);await setSession(session);next=await landingPath(u,x.next);}
 return Response.json({ok:true,next},{headers:{'Cache-Control':'no-store'}});
}catch(e){if(e instanceof z.ZodError)return Response.json({error:'Confirme o email e os campos de entrada.'},{status:400});return failure(e)}}
