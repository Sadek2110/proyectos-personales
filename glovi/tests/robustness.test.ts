import {test} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../server/app.ts';
import { detectIntent, geminiProvider, localAnswer } from '../server/assistant.ts';
import { distanceMeters } from '../server/catalog.ts';

async function fixture(options:AppOptions={}) {
  const instance=createApp({databasePath:':memory:',...options});
  const server=instance.app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  let cookie='';
  async function request(path:string,method='GET',body?:any,headers:Record<string,string>={}) {
    const response=await fetch(base+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return {status:response.status,data:await response.json() as any,headers:response.headers};
  }
  await request('/session');
  return {request,instance,close:async()=>{await new Promise<void>(r=>server.close(()=>r()));instance.close();}};
}

test('F02 Gemini requiere consentimiento, recibe idioma e historial y se revoca',async()=>{
  const calls:any[]=[];const f=await fixture({provider:async input=>{calls.push(input);return 'Bonjour, voici Ceuta.';}});
  try{
    assert.equal((await f.request('/chat','POST',{message:'Visit Ceuta'})).data.mode,'local');
    assert.equal(calls.length,0);
    await f.request('/preferences','PATCH',{aiConsent:true,language:'fr',interests:['history']});
    assert.equal((await f.request('/chat','POST',{message:'Que visiter?'})).data.mode,'gemini');
    assert.equal(calls[0].language,'fr');assert.equal(calls[0].history.length,2);
    assert.equal(Object.hasOwn(calls[0],'bookings'),false);
    assert.equal((await f.request('/chat','POST',{message:'urgence ambulance'})).data.mode,'emergency');
    assert.equal(calls.length,1);
    await f.request('/preferences','PATCH',{aiConsent:false});
    assert.equal((await f.request('/chat','POST',{message:'visites'})).data.mode,'local');assert.equal(calls.length,1);
  }finally{await f.close();}
});
test('F02 caída de IA conserva respuesta local útil e historial',async()=>{
  const f=await fixture({provider:async()=>{throw new Error('provider timeout');}});
  try{await f.request('/preferences','PATCH',{aiConsent:true});const r=await f.request('/chat','POST',{message:'visitar'});assert.equal(r.status,200);assert.equal(r.data.mode,'local_fallback');assert.match(r.data.answer,/Murallas/);assert.equal((await f.request('/chat/history')).data.messages.length,2);}finally{await f.close();}
});
test('F08 borrado durante consulta pendiente no resucita datos',async()=>{
  let resolve!:(s:string)=>void,started!:()=>void;const signal=new Promise<void>(r=>started=r);
  const f=await fixture({provider:async()=>{started();return new Promise<string>(r=>resolve=r);}});
  try{
    await f.request('/preferences','PATCH',{aiConsent:true});
    const pending=f.request('/chat','POST',{message:'Visit Ceuta'});await signal;
    assert.equal((await f.request('/chat','POST',{message:'again'})).status,409);
    await f.request('/privacy','DELETE');resolve('Ceuta');assert.equal((await pending).status,401);
    assert.equal(f.instance.store.one('SELECT COUNT(*) AS n FROM messages').n,0);
  }finally{await f.close();}
});
test('F02 contrato HTTP Gemini: secreto en cabecera, contexto, roles y sin pensamientos',async()=>{
  let url='',init:RequestInit|undefined;
  const fake=(async(u:any,i:any)=>{url=String(u);init=i;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'hidden',thought:true},{text:'Ceuta response'}]}}]}),{status:200});}) as typeof fetch;
  const provider=geminiProvider('test-secret','test-model',fake);
  assert.equal(await provider({message:'Visit?',language:'en',interests:['history'],history:[{role:'user',text:'hello'},{role:'assistant',text:'welcome'}]}),'Ceuta response');
  assert.ok(!url.includes('test-secret'));assert.equal((init!.headers as any)['x-goog-api-key'],'test-secret');assert.ok(init!.signal);
  const body=JSON.parse(init!.body as string);assert.equal(body.contents[1].role,'model');assert.match(body.systemInstruction.parts[0].text,/Murallas/);
});
test('F02 contrato Gemini rechaza HTTP fallido, respuesta vacía y nombre de modelo inválido',async()=>{
  for(const response of [new Response('{}',{status:429}),new Response('{}',{status:200})]) {
    const provider=geminiProvider('secret','test-model',(async()=>response) as typeof fetch);
    await assert.rejects(()=>provider({message:'test',language:'es',interests:[],history:[]}));
  }
  assert.throws(()=>geminiProvider('secret','../unsafe'));
});
test('F02 intenciones no confunden palabras inglesas y respuestas en cuatro idiomas',()=>{
  assert.equal(detectIntent('create a walking route'),'visit');
  for(const language of ['es','en','fr','ar'] as const){const r=localAnswer({language,message:'visit',interests:[],history:[]});assert.ok(r.sources.length);if(language==='ar')assert.match(r.answer,/[\u0600-\u06ff]/);}
});
test('F04 geometría real: misma posición, umbral, antimeridiano',()=>{
  assert.equal(distanceMeters(0,0,0,0),0);
  assert.ok(distanceMeters(0,0,0,0.00089)<100);
  assert.ok(distanceMeters(0,0,0,0.00091)>100);
  assert.ok(distanceMeters(0,179.9999,0,-179.9999)<30);
});
test('F04 fuera de ruta no avanza; inicio duplicado y nueva ruta tras abandonar',async()=>{
  const f=await fixture();try{
    await f.request('/preferences','PATCH',{locationConsent:true});
    const first=(await f.request('/tours','POST',{routeId:'ceuta-centro'})).data.tour;
    assert.equal((await f.request('/tours','POST',{routeId:'ceuta-centro'})).data.tour.id,first.id);
    assert.deepEqual((await f.request('/location','POST',{latitude:0,longitude:0,accuracy:2})).data.arrivals,[]);
    await f.request('/tours/current','DELETE');assert.notEqual((await f.request('/tours','POST',{routeId:'ceuta-centro'})).data.tour.id,first.id);
    assert.equal((await f.request('/tours','POST',{routeId:'unknown'})).status,404);
  }finally{await f.close();}
});
test('F08 límite de abuso mantiene emergencias accesibles',async()=>{
  const f=await fixture({rateLimit:2});try{await f.request('/status');assert.equal((await f.request('/status')).status,429);assert.equal((await f.request('/emergencies')).status,200);}finally{await f.close();}
});
test('F09 HTTPS permite cookie particionada para widget y origen público tras proxy',async()=>{
  const f=await fixture({cookieSecure:true,publicOrigin:'https://glovi.example',embedOrigins:['https://hotel.example',"bad; script-src *"]});
  try{
    const r=await f.request('/session');assert.match(r.headers.get('content-security-policy')!,/https:\/\/hotel.example/);assert.ok(!r.headers.get('content-security-policy')!.includes('script-src *'));
    assert.equal((await f.request('/preferences','PATCH',{language:'en'},{Origin:'https://glovi.example'})).status,200);
    const fresh=await f.request('/session','GET',undefined,{Cookie:''});const cookie=fresh.headers.get('set-cookie')!;
    assert.match(cookie,/Secure/);assert.match(cookie,/Partitioned/);assert.match(cookie,/SameSite=None/);
  }finally{await f.close();}
});
test('F01/F06 persistencia tras reinicio del servidor',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'glovi-persist-'));const path=join(dir,'db.sqlite');
  const f=await fixture({databasePath:path});
  let persistedCookie='';
  try{
    const fresh=await f.request('/session','GET',undefined,{Cookie:''});persistedCookie=fresh.headers.get('set-cookie')!.split(';')[0];
    await f.request('/preferences','PATCH',{language:'ar'});
    const slot=(await f.request('/services')).data.services[0].slots[0];
    assert.equal((await f.request('/bookings','POST',{slotId:slot.id,partySize:1,name:'Ada',contact:'ada@example.com',idempotencyKey:'persist-test-key'})).status,201);
  }finally{await f.close();}
  const second=await fixture({databasePath:path});
  try{assert.equal((await second.request('/session','GET',undefined,{Cookie:persistedCookie})).data.profile.language,'ar');assert.equal((await second.request('/bookings','GET',undefined,{Cookie:persistedCookie})).data.bookings.length,1);}finally{await second.close();rmSync(dir,{recursive:true,force:true});}
});
