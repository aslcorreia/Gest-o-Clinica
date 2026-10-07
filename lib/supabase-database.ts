import catalog from './query-catalog.json';
import {databaseRequest} from './supabase-http';

export const normalizeSql=(s:string)=>s.trim().replace(/\s+/g,' ');
const queries=new Map(catalog.map(q=>[q.sqlite,q]));
type Result<T=unknown>={results:T[];meta:{changes:number}};
export class Statement {
 constructor(readonly query:string,readonly args:unknown[]=[]){}
 bind(...args:unknown[]){return new Statement(this.query,args);}
 operation(){const q=queries.get(normalizeSql(this.query));if(!q)throw new Error('Database query is not registered');if(q.arity!==this.args.length)throw new Error('Database parameters do not match');return {id:q.id,args:this.args};}
 async all<T=unknown>():Promise<Result<T>>{return (await database().batch<T>([this]))[0];}
 async run(){return this.all();}
 async first<T=unknown>():Promise<T|null>{return (await this.all<T>()).results[0]||null;}
}
export function database(){return {prepare:(sql:string)=>new Statement(sql),async batch<T=unknown>(statements:Statement[]):Promise<Result<T>[]>{if(!statements.length)return [];return await databaseRequest({operations:statements.map(s=>s.operation())}) as Result<T>[];}};}
