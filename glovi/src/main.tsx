import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError } from './api';
import { translate, words, type Lang, type Word } from './i18n';
import './style.css';

type Profile={language:Lang;interests:string[];locationConsent:boolean;aiConsent:boolean};
type T=(key:Word)=>string;
function ErrorNotice({error,t}:{error:string;t:T}) {return error?<p role="alert">{t(error in words?error as Word:'error')}</p>:null;}
const code=(error:unknown)=>error instanceof ApiError?error.code:'error';
type Section='home'|'assistant'|'routes'|'bookings'|'emergency'|'privacy';
function Icon({name}:{name:Section|'arrow'|'spark'}) {
  const common={fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  const paths={home:<><path d="M3 11.5 12 4l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/></>,assistant:<><path d="M4 5h16v12H9l-5 4z"/><path d="M8 10h8M8 13h5"/></>,routes:<><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/></>,bookings:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3"/></>,emergency:<><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></>,privacy:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,spark:<><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/></>};
  return <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>{paths[name]}</svg>;
}
function Landing({t,onSelect}:{t:T;onSelect:(section:Section)=>void}) {
  return <section className="landing" aria-label={t('landingTitle')}>
    <div className="hero"><img src="/images/ceuta-portada.webp" alt="" fetchPriority="high"/><div className="hero-shade"/><div className="hero-copy"><p className="hero-kicker">{t('landingEyebrow')}</p><h2>{t('landingTitle')}</h2><p>{t('landingText')}</p><div className="hero-actions"><button onClick={()=>onSelect('routes')}>{t('discover')} <Icon name="arrow"/></button><button className="hero-secondary" onClick={()=>onSelect('assistant')}>{t('askGuide')}</button></div></div><span className="hero-index">01 / GLOVI · CEUTA</span></div>
    <div className="landing-intro"><div><p className="section-kicker">{t('landingEyebrow')}</p><h2>{t('landingSection')}</h2></div><p>{t('landingSectionText')}</p></div>
    <div className="feature-grid">
      <button className="feature feature-route" onClick={()=>onSelect('routes')}><span className="feature-photo"><img src="/images/ceuta-calle.webp" alt="" loading="lazy"/></span><span className="feature-body"><span className="feature-overline"><Icon name="routes"/>{t('routeMeta')}</span><strong>{t('routes')}</strong><span>{t('routeCardText')}</span><Icon name="arrow"/></span></button>
      <button className="feature feature-assistant" onClick={()=>onSelect('assistant')}><span className="feature-symbol"><Icon name="spark"/></span><span className="feature-body"><span className="feature-overline"><Icon name="assistant"/>GLOVI</span><strong>{t('assistant')}</strong><span>{t('assistantCardText')}</span><Icon name="arrow"/></span></button>
      <button className="feature feature-booking" onClick={()=>onSelect('bookings')}><span className="feature-photo"><img src="/images/ceuta-mar.webp" alt="" loading="lazy"/></span><span className="feature-body"><span className="feature-overline"><Icon name="bookings"/>{t('bookings')}</span><strong>{t('bookingFeatureTitle')}</strong><span>{t('bookingCardText')}</span><Icon name="arrow"/></span></button>
    </div><p className="visual-note">{t('visualNote')}</p>
  </section>;
}
function useLoad(path:string) {
  const [data,setData]=useState<any>(null),[error,setError]=useState('');
  const reload=()=>api(path).then(value=>{setData(value);setError('');}).catch(e=>setError(code(e)));
  useEffect(()=>{let active=true;setData(null);api(path).then(d=>{if(active){setData(d);setError('');}}).catch(e=>{if(active)setError(code(e));});return()=>{active=false;};},[path]);
  return {data,error,reload};
}
function App() {
  const [profile,setProfile]=useState<Profile>(),[status,setStatus]=useState<any>(),[tab,setTab]=useState<Section>(location.pathname==='/widget'?'assistant':'home'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[epoch,setEpoch]=useState(0);
  const t:T=key=>translate(profile?.language??'es',key);
  async function load() {try{const [s,health]=await Promise.all([api('/session'),api('/status')]);setProfile(s.profile);setStatus(health);setError('');}catch(e){setError(code(e));}}
  useEffect(()=>{load();},[]);
  useEffect(()=>{document.documentElement.lang=profile?.language??'es';document.documentElement.dir=profile?.language==='ar'?'rtl':'ltr';},[profile?.language]);
  async function save(changes:Partial<Profile>) {const previous=profile;setProfile(p=>p?{...p,...changes}:p);setSaving(true);setError('');try{setProfile((await api('/preferences','PATCH',changes)).profile);setNotice('saved');}catch(e){setProfile(previous);setError(code(e));}finally{setSaving(false);}}
  function selectTab(section:Section){setTab(section);setNotice('');if(tab==='home')requestAnimationFrame(()=>document.getElementById('contenido')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));}
  return <main className={location.pathname==='/widget'?'widget-app':'site-app'}>
    <header className="masthead">
      <div className="masthead-top"><p className="kicker">{t('intro')}</p>{profile&&<label className="header-lang">{t('language')}<select aria-label={t('language')} disabled={saving} value={profile.language} onChange={e=>save({language:e.target.value as Lang})}><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option><option value="ar">العربية</option></select></label>}<a className="sos" href="tel:112">{t('call')}</a></div>
      <h1 className="wordmark">GLOVI <small>Ceuta</small></h1>
    </header>
    <ErrorNotice error={error} t={t}/>
    {!profile?<><p>{t('loading')}</p><button onClick={load}>{t('retry')}</button><Emergency language="es" t={t}/></>:<>
      <nav aria-label="GLOVI" className="tabs">{((location.pathname==='/widget'?['assistant','routes','bookings','emergency','privacy']:['home','routes','assistant','bookings','emergency','privacy']) as Section[]).map(key=><button key={key} aria-pressed={tab===key} onClick={()=>selectTab(key)}><Icon name={key}/>{t(key)}</button>)}</nav>
      {tab==='home'&&<Landing t={t} onSelect={selectTab}/>}
      <section aria-label={t('interests')} className={'preferences '+(tab==='home'?'preferences-home':'')}>
        {tab==='home'&&<div className="preferences-heading"><p className="section-kicker">GLOVI</p><h2>{t('personalize')}</h2></div>}
        <fieldset disabled={saving}><legend>{t('interests')}</legend>{(['history','architecture','food'] as const).map(i=><label key={i}><input type="checkbox" checked={profile.interests.includes(i)} onChange={e=>save({interests:e.target.checked?[...profile.interests,i]:profile.interests.filter(x=>x!==i)})}/>{t(i)}</label>)}</fieldset>
        <label className="consent"><input disabled={saving} type="checkbox" checked={profile.locationConsent} onChange={e=>save({locationConsent:e.target.checked})}/>{t('location')}</label>
        <label className="consent"><input disabled={saving} type="checkbox" checked={profile.aiConsent} onChange={e=>save({aiConsent:e.target.checked})}/>{t('ai')}</label>
      </section>
      {notice&&<p role="status">{t(notice as Word)}</p>}
      <div id="contenido" key={epoch}>
        {tab==='assistant'&&<Chat t={t} language={profile.language} ai={status?.ai==='gemini'&&profile.aiConsent}/>}
        {tab==='routes'&&<Tours t={t} profile={profile}/>}
        {tab==='bookings'&&<Bookings t={t} language={profile.language}/>}
        {tab==='emergency'&&<Emergency t={t} language={profile.language}/>}
        {tab==='privacy'&&<Privacy t={t} onDelete={async()=>{await load();setEpoch(v=>v+1);setNotice('deleted');}}/>}
      </div>
      <footer className="foot"><p>{t('esim')}</p>{location.pathname==='/widget'&&<a href="/" target="_blank" rel="noopener noreferrer">{t('open')}</a>}</footer>
    </>}
  </main>;
}
function Chat({t,language,ai}:{t:T;language:Lang;ai:boolean}) {
  const {data,error:loadError,reload}=useLoad('/chat/history');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>();
  async function submit(e:FormEvent) {e.preventDefault();setBusy(true);setError('');try{setResult(await api('/chat','POST',{message}));setMessage('');await reload();}catch(e){setError(code(e));}finally{setBusy(false);}}
  const modeWord=(mode:string):Word=>mode==='emergency'?'emergencyMode':mode==='gemini'?'gemini':mode==='local_fallback'?'local_fallback':'local';
  return <section className="panel chat">
    <div className="panel-head"><h2>{t('assistant')}</h2><p className="badge">{ai?'Gemini':t('local')}</p></div>
    <p className="hint">{t('chatHint')}</p><ErrorNotice error={error||loadError} t={t}/>
    <div data-testid="messages" className="thread" aria-live="polite">{data?.messages.map((m:any,i:number)=><article key={i} className={'msg '+m.role}><small>{m.role==='assistant'?t(modeWord(m.mode)):'→'}</small><p>{m.text}</p></article>)}</div>
    {result?.sources?.length>0&&<ul className="sources">{result.sources.map((s:any)=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{t('source')}: {s.title}</a></li>)}</ul>}
    <form className="ask" onSubmit={submit}><label>{t('question')}<textarea lang={language} required maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label><button disabled={busy||!message.trim()}>{busy?t('loading'):t('send')}</button></form>
  </section>;
}
function Tours({t,profile}:{t:T;profile:Profile}) {
  const {data,error:loadError}=useLoad('/pois?language='+profile.language);
  const [tour,setTour]=useState<any>(),[arrivals,setArrivals]=useState<any[]>([]),[tracking,setTracking]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  const watch=useRef<number|undefined>(undefined);
  function stop(){if(watch.current!==undefined){navigator.geolocation?.clearWatch(watch.current);watch.current=undefined;}setTracking(false);}
  useEffect(()=>{api('/tours/current').then(d=>setTour(d.tour)).catch(e=>setError(code(e)));return()=>{if(watch.current!==undefined)navigator.geolocation?.clearWatch(watch.current);window.speechSynthesis?.cancel();};},[]);
  useEffect(()=>{if(!profile.locationConsent||tour?.status!=='active')stop();},[profile.locationConsent,tour?.status]);
  useEffect(()=>{setArrivals([]);window.speechSynthesis?.cancel();},[profile.language]);
  async function start(){setBusy(true);setError('');try{setTour((await api('/tours','POST',{routeId:'ceuta-centro'})).tour);setArrivals([]);}catch(e){setError(code(e));}finally{setBusy(false);}}
  function track(){
    if(!navigator.geolocation){setNote('gpsError');return;}
    setTracking(true);setError('');setNote('');let pending=false;
    watch.current=navigator.geolocation.watchPosition(async position=>{
      if(pending)return;pending=true;
      try{const d=await api('/location','POST',{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});setTour(d.tour);setNote(d.reason==='low_accuracy'?'accuracy':'');if(d.arrivals.length)setArrivals(previous=>[...previous,...d.arrivals]);}
      catch(e){setError(code(e));stop();}finally{pending=false;}
    },geoError=>{setNote(geoError.code===1?'gpsError':'gpsWaiting');if(geoError.code===1)stop();},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }
  function speak(text:string){
    const synth=window.speechSynthesis;const voice=synth?.getVoices().find(v=>v.lang.startsWith(profile.language));
    if(!synth||!voice){setNote('voiceError');return;}synth.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=profile.language;utterance.onerror=()=>setNote('voiceError');synth.speak(utterance);
  }
  async function abandon(){try{stop();setTour((await api('/tours/current','DELETE')).tour);}catch(e){setError(code(e));}}
  return <section className="panel tours">
    <div className="panel-head"><h2>{t('routes')} · Ceuta</h2></div>
    <p className="hint">{t('routeHint')}</p><ErrorNotice error={error||loadError} t={t}/>{note&&<p role="status">{t(note as Word)}</p>}
    <p data-testid="progress" className="progress">{tour?`${tour.visited.length} / 3 · ${t(tour.status)}`:'0 / 3'}</p>
    <div className="actions">
      {tour?.status!=='active'?<button onClick={start} disabled={busy}>{t('start')}</button>:<button className="ghost" onClick={abandon}>{t('abandon')}</button>}
      <button disabled={!profile.locationConsent||tour?.status!=='active'} onClick={tracking?stop:track}>{t(tracking?'stopGps':'gps')}</button>
      <button className="ghost" onClick={()=>window.speechSynthesis?.cancel()}>{t('stopVoice')}</button>
    </div>
    <div data-testid="arrivals" className="arrivals" aria-live="polite">{arrivals.length?arrivals.map(p=><article key={p.id} className="card"><h3>{p.name}</h3><p>{p.narration}</p><button onClick={()=>speak(p.narration)}>{t('listen')}</button></article>):<p>{t('noVisits')}</p>}</div>
    <ol className="stops">{data?.pois.map((p:any)=><li key={p.id}><div className={'stop-photo stop-photo-'+p.id}><img src={p.id==='murallas'?'/images/ceuta-mar.webp':p.id==='africa'?'/images/ceuta-calle.webp':'/images/ceuta-portada.webp'} alt="" loading="lazy"/></div><div className="stop-copy"><h3>{p.name} {tour?.visited.includes(p.id)?'✓':''}</h3><p>{p.narration}</p><button onClick={()=>speak(p.narration)}>{t('listen')}</button> <a href={p.directionsUrl} target="_blank" rel="noreferrer">{t('navigate')}</a> · <a href={p.source} target="_blank" rel="noreferrer">{t('source')}</a></div></li>)}</ol><p className="visual-note">{t('visualNote')}</p>
  </section>;
}
function Emergency({t,language}:{t:T;language:Lang}) {
  const {data,error,reload}=useLoad('/emergencies?language='+language);
  return <section className="panel emergency">
    <div className="panel-head"><h2>{t('emergency')}</h2><a className="call" href="tel:112">{t('call')}</a></div>
    <ErrorNotice error={error} t={t}/>{error&&<button onClick={reload}>{t('retry')}</button>}
    <ol className="steps">{data?.steps.map((s:string)=><li key={s}>{s}</li>)}</ol>{data?.services.map((s:any)=><article key={s.id} className="card service"><h3>{s.kind==='consular'?t('consular'):s.name}</h3>{s.kind==='hospital'&&<p>{s.address}</p>}{s.directionsUrl&&<a href={s.directionsUrl} target="_blank" rel="noreferrer">{t('navigate')}</a>} · <a href={s.source} target="_blank" rel="noreferrer">{t('source')}</a></article>)}
  </section>;
}
function Bookings({t,language}:{t:T;language:Lang}) {
  const services=useLoad('/services'),bookings=useLoad('/bookings');
  const [serviceId,setServiceId]=useState(''),[slotId,setSlotId]=useState(''),[name,setName]=useState(''),[contact,setContact]=useState(''),[partySize,setPartySize]=useState(2),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const attempt=useRef<{signature:string;key:string}|undefined>(undefined);
  const service=services.data?.services.find((s:any)=>s.id===serviceId)??services.data?.services[0];
  const slots=service?.slots.filter((s:any)=>s.available>0)??[];
  const selected=slots.find((s:any)=>s.id===slotId)??slots[0];
  const format=(date:string)=>new Date(date).toLocaleString(language,{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'})+' (Ceuta)';
  async function refresh(){await Promise.all([services.reload(),bookings.reload()]);}
  async function submit(e:FormEvent){e.preventDefault();if(!selected)return;setBusy(true);setError('');
    const payload={slotId:selected.id,partySize,name,contact};const signature=JSON.stringify(payload);
    if(attempt.current?.signature!==signature)attempt.current={signature,key:crypto.randomUUID()};
    try{await api('/bookings','POST',{...payload,idempotencyKey:attempt.current.key});attempt.current=undefined;setName('');setContact('');await refresh();}catch(e){setError(code(e));await services.reload();}finally{setBusy(false);}}
  async function cancel(id:string){setBusy(true);setError('');try{await api('/bookings/'+id+'/cancel','POST',{});await refresh();}catch(e){setError(code(e));}finally{setBusy(false);}}
  return <section className="panel bookings">
    <div className="panel-head"><h2>{t('bookings')}</h2></div><ErrorNotice error={error||services.error||bookings.error} t={t}/>
    <div className="book-grid">
      <form className="book-form" onSubmit={submit}><fieldset disabled={busy}><label>{t('service')}<select value={service?.id??''} onChange={e=>{setServiceId(e.target.value);setSlotId('');}}>{services.data?.services.map((s:any)=><option key={s.id} value={s.id}>{s.name}{s.demo?' · DEMO':''}</option>)}</select></label>
        {service&&<p className={service.demo?'stamp':'note'}>{t(service.demo?'demo':'internal')}</p>}
        {slots.length?<label>{t('slot')}<select value={selected?.id??''} onChange={e=>setSlotId(e.target.value)}>{slots.map((s:any)=><option key={s.id} value={s.id}>{format(s.startsAt)} · {s.available} {t('available')}</option>)}</select></label>:<p>{t('emptySlots')}</p>}
        <label>{t('people')}<input type="number" min="1" max="12" required value={partySize} onChange={e=>setPartySize(Number(e.target.value))}/></label>
        <label>{t('name')}<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>{t('email')}<input type="email" autoComplete="email" required maxLength={254} value={contact} onChange={e=>setContact(e.target.value)}/></label>
        <button disabled={!selected}>{t('request')}</button></fieldset></form>
      <div data-testid="bookings" className="book-list" aria-live="polite">{bookings.data?.bookings.length?bookings.data.bookings.map((b:any)=><article key={b.id} className="card"><h3>{b.serviceName}</h3><p>{format(b.startsAt)} · {b.partySize} {t('people')}</p><p><span className={'st st-'+b.status}>{t(b.status)}</span> · {b.demo?t('demo'):t('internal')}</p>{['requested','confirmed'].includes(b.status)&&<button disabled={busy} onClick={()=>cancel(b.id)}>{t('cancel')}</button>}</article>):<p>{t('emptyBookings')}</p>}</div>
    </div>
  </section>;
}
function Privacy({t,onDelete}:{t:T;onDelete:()=>Promise<void>}) {
  const [confirm,setConfirm]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function exportData(){try{const data=await api('/privacy/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='glovi-datos.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(code(e));}}
  async function remove(){setBusy(true);try{await api('/privacy','DELETE');await onDelete();}catch(e){setError(code(e));setBusy(false);}}
  return <section className="panel privacy">
    <div className="panel-head"><h2>{t('privacy')}</h2></div>
    <p className="hint">{t('privacyText')}</p><ErrorNotice error={error} t={t}/>
    <div className="actions"><button className="ghost" onClick={exportData}>{t('export')}</button></div>
    <div className="danger-zone"><label className="consent"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{t('confirmDelete')}</label><button className="danger" disabled={!confirm||busy} onClick={remove}>{t('delete')}</button></div>
  </section>;
}

function Admin(){
  const [token,setToken]=useState(''),[active,setActive]=useState(''),[bookings,setBookings]=useState<any[]>([]),[services,setServices]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const t:T=k=>translate('es',k);
  async function refresh(key=active){const [b,s]=await Promise.all([api('/admin/bookings','GET',undefined,key),api('/services')]);setBookings(b.bookings);setServices(s.services);}
  async function login(e:FormEvent){e.preventDefault();setError('');try{await refresh(token);setActive(token);setToken('');}catch{setError('Acceso denegado. Revisa el token de administración.');}}
  async function update(id:string,status:string){setBusy(true);setError('');try{await api('/admin/bookings/'+id,'PATCH',{status},active);await refresh();}catch{setError('No se pudo cambiar el estado. Actualiza los datos.');}finally{setBusy(false);}}
  async function createService(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,values=new FormData(form);setBusy(true);setError('');try{await api('/admin/services','POST',{name:values.get('name'),description:values.get('description'),kind:values.get('kind'),demo:values.get('demo')==='on'},active);form.reset();await refresh();setNotice('Servicio creado');}catch{setError('Revisa los datos del servicio.');}finally{setBusy(false);}}
  async function createSlot(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,values=new FormData(form);setBusy(true);setError('');try{await api('/admin/services/'+values.get('service')+'/slots','POST',{startsAt:new Date(String(values.get('date'))).toISOString(),capacity:Number(values.get('capacity'))},active);form.reset();await refresh();setNotice('Turno creado');}catch{setError('Revisa la fecha futura, el aforo y que el turno no exista.');}finally{setBusy(false);}}
  return <main className="admin">
    <header className="masthead">
      <div className="masthead-top"><p className="kicker">GLOVI · Ceuta</p><a href="/">Volver a GLOVI</a></div>
      <h1 className="wordmark wordmark-admin">Operación del piloto</h1>
    </header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!active?<form onSubmit={login}><label>Token de administración<input type="password" autoComplete="off" required value={token} onChange={e=>setToken(e.target.value)}/></label><button>Entrar</button></form>:<>
      <div className="actions"><button className="ghost" onClick={()=>{setActive('');setBookings([]);setServices([]);}}>Salir</button><button onClick={()=>refresh().catch(()=>setError('No se pudieron actualizar los datos.'))}>Actualizar</button></div>
      <h2>Solicitudes de reserva</h2>{bookings.map(b=><article key={b.id} className="card" data-testid="admin-booking"><h3>{b.serviceName}{b.demo?' · DEMO':''}</h3><p>{b.name} · {b.contact} · {b.partySize} personas · {new Date(b.startsAt).toLocaleString('es',{timeZone:'Europe/Madrid'})} (Ceuta)</p><p><span className={'st st-'+b.status}>{t(b.status)}</span> · {b.language}</p>{b.status==='requested'&&<div className="actions"><button className="ok" disabled={busy} onClick={()=>update(b.id,'confirmed')}>Confirmar</button><button className="ghost" disabled={busy} onClick={()=>update(b.id,'rejected')}>Rechazar</button></div>}</article>)}
      <h2>Nuevo servicio</h2><form onSubmit={createService}><fieldset disabled={busy}><label>Nombre del servicio<input name="name" required minLength={2} maxLength={120}/></label><label>Descripción<textarea name="description" required minLength={2} maxLength={1000}/></label><label>Tipo<select name="kind"><option value="restaurant">Restaurante</option><option value="experience">Experiencia</option></select></label><label className="consent"><input type="checkbox" name="demo" defaultChecked/>Servicio de demostración</label><button>Crear servicio</button></fieldset></form>
      <h2>Nuevo turno</h2><form onSubmit={createSlot}><fieldset disabled={busy}><label>Servicio<select name="service">{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Fecha y hora (zona de tu navegador)<input type="datetime-local" name="date" required/></label><label>Aforo<input type="number" name="capacity" min={1} max={1000} required defaultValue={8}/></label><button>Crear turno</button></fieldset></form>
    </>}
  </main>;
}
createRoot(document.getElementById('root')!).render(location.pathname==='/admin'?<Admin/>:<App/>);
