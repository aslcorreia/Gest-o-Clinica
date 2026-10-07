import {signOut} from '@/lib/auth';
import {checkOrigin,failure} from '@/lib/server';
export async function POST(req:Request){try{checkOrigin(req);await signOut();return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e)}}
