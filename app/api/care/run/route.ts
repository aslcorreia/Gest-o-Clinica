import {env} from 'cloudflare:workers';
import {db,failure,Identity} from '@/lib/server';
import {runClinic} from '@/lib/care-server';
// External scheduler calls this protected endpoint; never expose the secret to browsers.
export async function POST(req:Request){const key=(env as any).CARE_CRON_SECRET;if(!key||req.headers.get('authorization')!=='Bearer '+key)return new Response('Unauthorized',{status:401});try{const clinics=await db().prepare('SELECT id,owner FROM clinics').all<any>();let prepared=0;for(const c of clinics.results){const a={tenant:c.id,role:'director',owner:true,therapist:'',user:{userId:c.owner}} as Identity;prepared+=(await runClinic(a)).prepared}return Response.json({prepared})}catch(e){return failure(e)}}
