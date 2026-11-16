import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';

let server: Server, base: string, cookie: string, dir: string, app: ReturnType<typeof createApp>;
async function call(path: string, method = 'GET', body?: unknown, auth = cookie, headers: Record<string,string> = {}) {
  const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type':'application/json', ...(auth ? { Cookie: auth } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json() as any, headers: res.headers };
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'glovi-test-'));
  app = createApp({ databasePath: join(dir, 'test.sqlite'), adminToken: 'test-admin-token-strong', rateLimit: 1000 });
  server = app.app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  cookie = '';
  const res = await call('/session'); cookie = res.headers.get('set-cookie')!.split(';')[0];
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); app.close(); rmSync(dir, {recursive:true,force:true}); });
const admin = { Authorization: 'Bearer test-admin-token-strong' };
async function slot() { return (await call('/services')).data.services[0].slots[0]; }
async function reserve(extra = {}, key = 'booking-key-001') {
  return call('/bookings', 'POST', { slotId: (await slot()).id, partySize: 2, name:'Ana', contact:'ana@example.com', idempotencyKey:key, ...extra });
}

test('F01 sesión persiste preferencias, valida idioma e intereses', async () => {
  assert.equal((await call('/preferences','PATCH',{language:'fr',interests:['history']})).status,200);
  assert.equal((await call('/session')).data.profile.language,'fr');
  assert.equal((await call('/preferences','PATCH',{language:'xx'})).status,400);
  assert.equal((await call('/preferences','PATCH',{interests:['injected']})).status,400);
  assert.equal((await call('/preferences','PATCH',{locationConsent:'true'})).status,400);
});
test('F08 cookies y cabeceras seguras, mutaciones de otro origen bloqueadas', async () => {
  const fresh = await call('/session','GET',undefined,'');
  assert.match(fresh.headers.get('set-cookie')!,/HttpOnly/);
  assert.match(fresh.headers.get('set-cookie')!,/SameSite=Lax/);
  assert.ok(fresh.headers.get('content-security-policy'));
  assert.equal((await call('/preferences','PATCH',{language:'en'},cookie,{Origin:'https://attacker.invalid'})).status,403);
});
test('F03 catálogo localizado y ruta con paradas válidas', async () => {
  const pois = (await call('/pois?language=ar&interest=architecture')).data.pois;
  assert.ok(pois.length > 0); assert.match(pois[0].narration,/[\u0600-\u06ff]/);
  const routes = (await call('/routes')).data.routes;
  assert.equal(routes[0].stops.length,3);
  assert.equal((await call('/pois?language=bad')).status,400);
});
test('F04 GPS requiere permiso y rechaza coordenadas y precisión inválidas', async () => {
  await call('/tours','POST',{routeId:'ceuta-centro'});
  assert.equal((await call('/location','POST',{latitude:35.888,longitude:-5.316,accuracy:10})).status,403);
  await call('/preferences','PATCH',{locationConsent:true});
  assert.equal((await call('/location','POST',{latitude:91,longitude:0,accuracy:10})).status,400);
  assert.equal((await call('/location','POST',{latitude:35.888,longitude:-5.316,accuracy:-1})).status,400);
  const inaccurate = await call('/location','POST',{latitude:35.888,longitude:-5.316,accuracy:500});
  assert.equal(inaccurate.data.reason,'low_accuracy'); assert.deepEqual(inaccurate.data.arrivals,[]);
});
test('F04 entrada en cada parada una sola vez y finalización persistente sin GPS almacenado', async () => {
  await call('/preferences','PATCH',{locationConsent:true});
  await call('/tours','POST',{routeId:'ceuta-centro'});
  const pois = (await call('/pois')).data.pois;
  for (const poi of pois) {
    const input = {latitude:poi.latitude,longitude:poi.longitude,accuracy:5};
    const arrived = await call('/location','POST',input);
    assert.ok(arrived.data.arrivals.some((p:any) => p.id === poi.id));
    assert.deepEqual((await call('/location','POST',input)).data.arrivals,[]);
  }
  assert.equal((await call('/tours/current')).data.tour.status,'completed');
  const exported = (await call('/privacy/export')).data;
  assert.ok(!JSON.stringify(exported).includes('latitude'));
  assert.equal(exported.tours[0].visited.length,3);
});
test('F04 revocar permiso detiene nuevas visitas y permite abandonar', async () => {
  await call('/preferences','PATCH',{locationConsent:true});
  await call('/tours','POST',{routeId:'ceuta-centro'});
  await call('/preferences','PATCH',{locationConsent:false});
  assert.equal((await call('/location','POST',{latitude:35.888,longitude:-5.316,accuracy:5})).status,403);
  assert.equal((await call('/tours/current','DELETE')).status,200);
  assert.equal((await call('/tours/current')).data.tour.status,'abandoned');
});
test('F05 emergencias públicas en cuatro idiomas, fuentes y navegación sin GPS', async () => {
  for (const language of ['es','en','fr','ar']) {
    const res = await call('/emergencies?language='+language,'GET',undefined,'');
    assert.equal(res.status,200); assert.equal(res.data.phone,'112'); assert.equal(res.data.steps.length,3);
    assert.ok(res.data.services.find((s:any) => s.kind==='hospital').directionsUrl.startsWith('https://www.google.com/maps/dir/'));
    assert.ok(res.data.services.find((s:any) => s.kind==='consular').source.includes('spain.info'));
  }
});
test('F02 chat local multilingüe, historial y emergencia determinista', async () => {
  await call('/preferences','PATCH',{language:'en'});
  const res = await call('/chat','POST',{message:'What can I visit?'});
  assert.equal(res.data.mode,'local'); assert.ok(res.data.sources.length); assert.match(res.data.answer,/Ceuta/);
  assert.equal((await call('/chat/history')).data.messages.length,2);
  const sos = await call('/chat','POST',{message:'I need an ambulance'});
  assert.equal(sos.data.mode,'emergency'); assert.match(sos.data.answer,/112/);
  assert.equal((await call('/chat','POST',{message:' '})).status,400);
});
test('F06 reserva persistente e idempotencia con conflicto de contenido', async () => {
  const first = await reserve(); assert.equal(first.status,201); assert.equal(first.data.booking.status,'requested');
  assert.equal(first.data.booking.demo,true);
  assert.equal((await reserve()).data.booking.id,first.data.booking.id);
  assert.equal((await reserve({partySize:3})).status,409);
  assert.equal((await call('/bookings')).data.bookings.length,1);
});
test('F06 no sobreventa concurrente y cancelación libera plazas', async () => {
  const s = await slot();
  const results = await Promise.all(Array.from({length:8},(_,i) => reserve({partySize:2},'parallel-key-'+i)));
  const accepted = results.filter(r=>r.status===201);
  assert.equal(accepted.length,s.available/2);
  assert.ok(results.filter(r=>r.status!==201).every(r=>r.status===409));
  await call('/bookings/'+accepted[0].data.booking.id+'/cancel','POST',{});
  assert.equal((await slot()).available,2);
  assert.equal((await reserve({},'after-cancel-key')).status,201);
});
test('F06 valida datos y acceso a reservas de otra sesión', async () => {
  assert.equal((await reserve({partySize:0})).status,400);
  assert.equal((await reserve({contact:'not-an-email'})).status,400);
  assert.equal((await reserve({slotId:'missing-slot'})).status,404);
  const booked = await reserve();
  const second = (await call('/session','GET',undefined,'')).headers.get('set-cookie')!.split(';')[0];
  assert.deepEqual((await call('/bookings','GET',undefined,second)).data.bookings,[]);
  assert.equal((await call('/bookings/'+booked.data.booking.id+'/cancel','POST',{},second)).status,404);
});
test('F07 administración autorizada y transiciones coherentes', async () => {
  assert.equal((await call('/admin/bookings')).status,401);
  const booked = (await reserve()).data.booking;
  assert.equal((await call('/admin/bookings/'+booked.id,'PATCH',{status:'confirmed'},cookie,admin)).status,200);
  assert.equal((await call('/admin/bookings/'+booked.id,'PATCH',{status:'rejected'},cookie,admin)).status,409);
  assert.equal((await call('/bookings/'+booked.id+'/cancel','POST',{})).status,200);
  assert.equal((await call('/admin/bookings/'+booked.id,'PATCH',{status:'confirmed'},cookie,admin)).status,409);
});
test('F07 operador crea servicio y turno, rechaza pasado y capacidad inválida', async () => {
  const service = await call('/admin/services','POST',{name:'Tour piloto',kind:'experience',description:'Servicio piloto',demo:true},cookie,admin);
  assert.equal(service.status,201);
  const path = '/admin/services/'+service.data.service.id+'/slots';
  const startsAt = new Date(Date.now()+86400000).toISOString();
  assert.equal((await call(path,'POST',{startsAt,capacity:4},cookie,admin)).status,201);
  assert.equal((await call(path,'POST',{startsAt:'2020-01-01T00:00:00Z',capacity:4},cookie,admin)).status,400);
  assert.equal((await call(path,'POST',{startsAt,capacity:0},cookie,admin)).status,400);
});
test('F08 exportación y borrado en cascada sin acceso posterior', async () => {
  await reserve(); await call('/chat','POST',{message:'Ceuta'}); await call('/tours','POST',{routeId:'ceuta-centro'});
  const exported = (await call('/privacy/export')).data;
  assert.equal(exported.bookings.length,1); assert.equal(exported.messages.length,2);
  assert.equal((await call('/privacy','DELETE')).status,200);
  assert.equal((await call('/bookings')).status,401);
  assert.equal((await call('/admin/bookings','GET',undefined,'',admin)).data.bookings.length,0);
});
test('F10 estado no presenta eSIM ni IA simuladas', async () => {
  const status = (await call('/status')).data;
  assert.equal(status.ai,'local'); assert.equal(status.esim,'unavailable');
  assert.equal(status.reservations,'internal');
});
test('F08 errores JSON, cuerpos excesivos, rutas inexistentes y consultas inválidas', async () => {
  const bad = await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{broken'});
  assert.equal(bad.status,400); assert.equal((await bad.json() as any).error.code,'invalid_json');
  assert.equal((await call('/chat','POST',{message:'x'.repeat(40000)})).status,413);
  assert.equal((await call('/nonexistent')).status,404);
  assert.equal((await call('/emergencies?language=xx')).status,400);
});
