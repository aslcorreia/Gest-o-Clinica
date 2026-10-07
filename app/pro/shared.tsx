'use client';
import {createContext,useContext} from 'react';
import {Rec} from '@/lib/model';
import {Button} from '@/components/ui/button';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '@/components/ui/table';
import {Plus,FileText} from 'lucide-react';
export type ProContext={records:Rec[];practice?:()=>void;director:boolean;me:string;auth:boolean;view:string;busy:boolean;date:string;save:(r:Rec,close?:boolean)=>Promise<Rec|null>;open:(kind:string,existing?:Rec,preset?:any)=>void;go:(page:string)=>void;patient:(r:Rec)=>void;reload:()=>void;upload:(file:Blob,name:string,visibility?:string,patientId?:string)=>Promise<any>};
export const Pro=createContext<ProContext>(null!);
export const usePro=()=>useContext(Pro);
export const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
export const day=()=>new Date().toISOString().slice(0,10);
export const money=(n:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n||0);
export const fresh=(kind:string,data:any):Rec=>({id:uid(),kind,version:0,data});
export function Card({title,sub,actions,children}:any){return <section className="panel pro-card"><div className="panel-head"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div><div className="actions">{actions}</div></div>{children}</section>}
export function Empty({children='Sem registos para apresentar.'}:any){return <div className="empty"><FileText size={25}/><p>{children}</p></div>}
export function Pick({value,change,options,label}:any){return <Select value={value||'_none'} onValueChange={v=>change(v==='_none'?'':v)}><SelectTrigger aria-label={label||'Selecionar'}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="_none">Selecionar</SelectItem>{options.map((o:any)=>typeof o==='string'?<SelectItem key={o} value={o}>{o}</SelectItem>:<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}
export function Add({kind,label='Adicionar',preset}:any){const p=usePro();return <Button onClick={()=>p.open(kind,undefined,preset)}><Plus size={16}/>{label}</Button>}
export function Badge({children}:any){return <span className={'pill '+(/Conclu|Pago|Aprov|Ativo|Dispon/.test(String(children))?'green':/Pendente|rever|aprovar|Atras|Repor/.test(String(children))?'orange':'')}>{children||'—'}</span>}
export function GridTable({heads,rows}: {heads:string[];rows:React.ReactNode[][]}){return rows.length?<Table><TableHeader><TableRow>{heads.map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row,i)=><TableRow key={i}>{row.map((v,j)=><TableCell key={j}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>:<Empty/>}
export function StatGrid({items}: {items:[string,React.ReactNode,string?][]}){return <div className="stats pro-stats">{items.map(([title,v,sub])=><div className="stat" key={title}><span>{title}</span><strong>{v}</strong>{sub&&<small>{sub}</small>}</div>)}</div>}
export function exportCsv(name:string,heads:string[],rows:any[][]){const esc=(v:any)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';download(name+'.csv','\ufeff'+[heads,...rows].map(row=>row.map(esc).join(';')).join('\n'),'text/csv')}
export function download(name:string,body:string,type='text/plain'){const u=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
export function safeUrl(value:string){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:undefined}catch{return undefined}}
