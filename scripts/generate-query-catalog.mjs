// Compile only source-controlled queries. Clients never submit SQL to Supabase.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const root=process.cwd(),queries=new Set(),normal=s=>s.trim().replace(/\s+/g,' ');
function files(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(p,f.name)):f.name.endsWith('.ts')?[path.join(p,f.name)]:[]);}
const paths=[...files(path.join(root,'app/api')),...['server','care-server','auth'].map(n=>path.join(root,'lib/'+n+'.ts'))];
for(const file of paths){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const expressions=[];function walk(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='prepare')expressions.push(n.arguments[0]);ts.forEachChild(n,walk);}walk(source);
 let contexts=[{}];
 if(file.endsWith('/data/route.ts')){
  const conflicts=[''];function find(n){if(ts.isBinaryExpression(n)&&n.left.getText(source)==='conflictSql'&&[ts.SyntaxKind.StringLiteral,ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(n.right.kind))conflicts.push(n.right.text);ts.forEachChild(n,find);}find(source);
  contexts=conflicts.flatMap(conflictSql=>Array.from({length:9},(_,i)=>({conflictSql,emails:Array(i).fill('email')})));
 }else if(file.endsWith('/access/route.ts')){
  contexts=[];for(const existing of [false,true])for(const enabled of [false,true])for(const profile of [false,true]){
   let guard=existing?' AND EXISTS(SELECT 1 FROM memberships WHERE id=? AND clinic=? AND therapist=? AND enabled=?)':' AND NOT EXISTS(SELECT 1 FROM memberships WHERE email=?)';
   if(enabled)guard+=' AND NOT EXISTS(SELECT 1 FROM family_access WHERE email=?) AND NOT EXISTS(SELECT 1 FROM memberships WHERE clinic=? AND therapist=? AND enabled=1 AND email<>?)';
   guard+=profile?' AND NOT EXISTS(SELECT 1 FROM records WHERE id=?)':' AND EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)';contexts.push({guard});
  }
 }else if(file.endsWith('/care-server.ts'))contexts=Array.from({length:52},(_,i)=>[false,true].map(guard=>({guard,checks:Array(i).fill(' AND EXISTS(SELECT 1 FROM records WHERE id=? AND clinic=? AND version=?)').join('')}))).flat();
 else if(file.endsWith('/parents/route.ts'))contexts=[{dependency:false},{dependency:true}];
 for(const expression of expressions)for(const context of contexts){try{queries.add(normal(vm.runInNewContext(expression.getText(source),context,{timeout:50})));}catch(e){throw Error(path.relative(root,file)+': '+expression.getText(source)+'\n'+e.message);}}
}
function postgres(sql){
 const ignore=/^INSERT OR IGNORE /i.test(sql);sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ');
 sql=sql.replace(/json_extract\((\w+(?:\.\w+)?),'\$\.(\w+)'\)/g,"($1::jsonb->>'$2')").replace(/json_set\(/g,'linguar_private.json_set(').replace(/AS firstAccess/g,'AS "firstAccess"');
 if(ignore)sql+=' ON CONFLICT DO NOTHING';
 let i=0;sql=sql.replace(/%/g,'%%').replace(/\?/g,()=>'%'+(++i)+'$L');return {sql,arity:i};
}
const catalog=[...queries].sort().map(sqlite=>{const p=postgres(sqlite);return {id:crypto.createHash('sha256').update(sqlite).digest('hex').slice(0,24),sqlite,postgres:p.sql,arity:p.arity,readOnly:/^SELECT /i.test(sqlite)};});
fs.writeFileSync('lib/query-catalog.json',JSON.stringify(catalog,null,2)+'\n');
const sqlQuote=s=>"'"+s.replaceAll("'","''")+"'";
fs.mkdirSync('supabase',{recursive:true});
fs.writeFileSync('supabase/query-catalog.sql',catalog.map(q=>'INSERT INTO linguar_private.query_catalog(id,query_text,arity,read_only) VALUES('+[q.id,q.postgres].map(sqlQuote).join(',')+','+q.arity+','+q.readOnly+') ON CONFLICT(id) DO UPDATE SET query_text=excluded.query_text,arity=excluded.arity,read_only=excluded.read_only;').join('\n')+'\n');
console.log('Registered '+catalog.length+' server queries');
