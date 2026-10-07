'use client';
import {useEffect,useState,useRef} from 'react';
export default function Logout(){const [error,setError]=useState(''),started=useRef(false);useEffect(()=>{if(started.current)return;started.current=true;fetch('/api/auth/logout',{method:'POST'}).then(async r=>{if(!r.ok)throw Error('Não foi possível terminar a sessão. Tente novamente.');location.replace('/login')}).catch(e=>setError(e.message));},[]);return <main className="p-8"><p role={error?'alert':undefined}>{error||'A terminar a sessão…'}</p>{error&&<button onClick={()=>location.reload()}>Tentar novamente</button>}</main>}
