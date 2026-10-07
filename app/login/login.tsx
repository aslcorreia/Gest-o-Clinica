'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import './login.css';
export default function Login(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[mode,setMode]=useState<'link'|'password'>('link'),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const next=()=>new URLSearchParams(location.search).get('next')||'/';
 async function submit(action:'login'|'verify'){
  setBusy(true);setError('');try{const r=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,next:next(),...(action==='verify'?{code}:mode==='password'?{password}:{})})}),j:any=await r.json();if(!r.ok)throw Error(j.error);if(action==='verify'||mode==='password')location.assign(j.next||'/');else setSent(true);}catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.');}finally{setBusy(false);}
 }
 return <main className="login-shell"><section className="login-card"><a className="login-brand" href="/">Bem Crescer<span>ACOMPANHAMENTO CLÍNICO</span></a><h1>{sent?'Verifique o seu email':'Bem-vinda à clínica Bem Crescer'}</h1><p>{sent?'Abra o link de entrada que enviámos. Se o email incluir um código, também o pode escrever abaixo.':'Entre com o email autorizado pela clínica para abrir a sua área.'}</p>
 {!sent?<form onSubmit={e=>{e.preventDefault();submit('login')}}><label>Email<Input autoComplete="email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>{mode==='password'&&<label>Palavra-passe<Input autoComplete="current-password" type="password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}<Button disabled={busy} type="submit">{busy?'A entrar…':mode==='link'?'Receber link de entrada':'Iniciar sessão'}</Button><Button variant="ghost" type="button" disabled={busy} onClick={()=>{setMode(mode==='link'?'password':'link');setError('')}}>{mode==='link'?'Usar palavra-passe':'Entrar por email'}</Button></form>:<><form onSubmit={e=>{e.preventDefault();submit('verify')}}><label>Código de entrada<Input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,10}" maxLength={10} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} disabled={busy}/></label><Button disabled={busy} type="submit">{busy?'A confirmar…':'Confirmar código'}</Button></form><Button variant="ghost" disabled={busy} onClick={()=>{setSent(false);setCode('')}}>Voltar à entrada</Button></>}
 {error&&<p role="alert" className="login-error">{error}</p>}<p className="login-caption">Clínica · Terapeutas · Famílias</p></section></main>;
}
