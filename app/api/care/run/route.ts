import {env} from 'cloudflare:workers';
import {failure} from '@/lib/server';
import {runScheduledPreparations} from '@/lib/care-scheduler';
// External scheduler calls this protected endpoint; never expose the secret to browsers.
export async function POST(req:Request){const key=(env as any).CARE_CRON_SECRET;if(!key||req.headers.get('authorization')!=='Bearer '+key)return new Response('Unauthorized',{status:401});try{const result=await runScheduledPreparations(new Date(),'external');return Response.json(result,{status:result.failed?503:200})}catch(e){return failure(e)}}
