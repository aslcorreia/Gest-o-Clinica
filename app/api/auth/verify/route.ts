import {z} from 'zod';
import {authorizedEmail,setSession,verifiedUser,landingPath} from '@/lib/auth';
import {authRequest} from '@/lib/supabase-http';
import {checkOrigin,failure,AppError} from '@/lib/server';
const input=z.union([
 z.object({email:z.string().trim().email().max(254),code:z.string().regex(/^\d{6,10}$/),next:z.string().optional()}),
 z.object({access_token:z.string().min(20).max(10000),refresh_token:z.string().min(10).max(1000),next:z.string().optional()})
]);
export async function POST(req:Request){try{
 checkOrigin(req);const x=input.parse(await req.json());let session:any;
 if('email' in x){if(!await authorizedEmail(x.email))throw new AppError('O acesso ainda não foi autorizado.',403);const r=await authRequest('verify',{email:x.email.toLowerCase(),token:x.code,type:'email'});if(!r.ok)throw new AppError('Código inválido ou expirado.');session=await r.json();}else session=x;
 const user=await verifiedUser(session.access_token);if(!user||!await authorizedEmail(user.email))throw new AppError('O acesso não está autorizado ou o link expirou.',403);
 await setSession(session);
 return Response.json({ok:true,next:await landingPath(user,x.next)},{headers:{'Cache-Control':'no-store'}});
}catch(e){if(e instanceof z.ZodError)return Response.json({error:'Link ou código inválido.'},{status:400});return failure(e)}}
