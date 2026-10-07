import handler from 'vinext/server/fetch-handler';
import {runScheduledPreparations} from '../lib/care-scheduler';

export default {
 fetch(request:Request,env:Record<string,unknown>,ctx:ExecutionContext){return handler.fetch(request,env,ctx)},
 async scheduled(_event:ScheduledController,_env:Record<string,unknown>,_ctx:ExecutionContext){
  const result=await runScheduledPreparations();
  if(result.failed)throw new Error('Bem Crescer: preparação diária incompleta');
 }
} satisfies ExportedHandler<Record<string,unknown>>;
