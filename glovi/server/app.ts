import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import { openStore } from './store.ts';
import { directions, distanceMeters, emergencyServices, emergencySteps, interests, languages, localizedPoi, pois, routes, type Language } from './catalog.ts';
import { localAnswer, type Provider } from './assistant.ts';

class ApiError extends Error { constructor(public status:number,public code:string) { super(code); } }
const fail=(status:number,code:string):never=>{throw new ApiError(status,code);};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const langSchema=z.enum(languages);
const profileSchema=z.object({language:langSchema.optional(),interests:z.array(z.enum(interests)).max(3).optional(),locationConsent:z.boolean().optional(),aiConsent:z.boolean().optional()}).strict();
const bookingSchema=z.object({slotId:z.string().min(1).max(100),partySize:z.number().int().min(1).max(12),name:z.string().trim().min(2).max(100),contact:z.email().max(254),idempotencyKey:z.string().min(8).max(100)}).strict();
const now=()=>new Date().toISOString();
export type AppOptions={databasePath?:string;adminToken?:string;provider?:Provider;rateLimit?:number;cookieSecure?:boolean;embedOrigins?:string[];publicOrigin?:string};

export function createApp(options:AppOptions={}) {
  const store=openStore(options.databasePath??'data/glovi.sqlite');
  const {query,one,run,transaction}=store;
  const app=express();
  app.disable('x-powered-by');
  const buckets=new Map<string,{count:number;until:number}>();
  const inFlight=new Set<string>();
  const embeds=(options.embedOrigins??[]).filter(origin=>/^https?:\/\/[\w.:-]+$/.test(origin));
  app.use((req,res,next)=>{
    res.set({
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Permissions-Policy':'geolocation=(self), microphone=(), camera=()',
      'Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' ${embeds.join(' ')}`,
      'Cache-Control':req.path.startsWith('/api')?'no-store':'no-cache'
    });
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin!==(options.publicOrigin||`${req.protocol}://${req.get('host')}`)) return next(new ApiError(403,'origin_forbidden'));
    if(req.path.startsWith('/api') && req.path!=='/api/emergencies') {
      const time=Date.now();
      for(const [key,value] of buckets) if(value.until<=time) buckets.delete(key);
      const key=req.ip??'unknown'; const bucket=buckets.get(key)??{count:0,until:time+60000};
      bucket.count++; buckets.set(key,bucket);
      if(bucket.count>(options.rateLimit??240)) { res.set('Retry-After','60'); return next(new ApiError(429,'rate_limited')); }
    }
    next();
  });
  app.use(express.json({limit:'32kb'}));
  const cookieOptions={httpOnly:true,sameSite:options.cookieSecure?'none' as const:'lax' as const,secure:options.cookieSecure??false,partitioned:options.cookieSecure??false,path:'/',maxAge:30*86400000};
  const getSession=(req:Request) => {
    const value=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('glovi_session='))?.slice(14);
    if(!value || !/^[a-f0-9]{64}$/.test(value)) return undefined;
    return one('SELECT * FROM sessions WHERE id=?',hash(value));
  };
  const session=(req:Request,res:Response,next:NextFunction)=>{
    const user=getSession(req); if(!user) return next(new ApiError(401,'session_required'));
    res.locals.session=user; res.locals.profile=JSON.parse(user.profile); next();
  };
  const admin=(req:Request,_res:Response,next:NextFunction)=>{
    const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
    const expected=options.adminToken;
    if(!expected||!timingSafeEqual(Buffer.from(hash(token)),Buffer.from(hash(expected)))) return next(new ApiError(401,'admin_required'));
    next();
  };
  const parseLanguage=(value:unknown,fallback:Language='es')=>value===undefined?fallback:langSchema.parse(value);
  const currentTour=(id:string)=>one('SELECT * FROM tours WHERE session_id=? ORDER BY rowid DESC LIMIT 1',id);
  const tourJson=(tour:any)=>tour?{id:tour.id,routeId:tour.route_id,status:tour.status,visited:JSON.parse(tour.visited),createdAt:tour.created_at}:null;
  const bookingsSql=`SELECT b.*, s.name AS service_name,s.demo,s.kind, sl.starts_at FROM bookings b JOIN slots sl ON sl.id=b.slot_id JOIN services s ON s.id=sl.service_id`;
  const bookingJson=(b:any)=>({id:b.id,slotId:b.slot_id,serviceName:b.service_name,kind:b.kind,demo:!!b.demo,startsAt:b.starts_at,partySize:b.party_size,name:b.name,contact:b.contact,status:b.status,language:b.language,createdAt:b.created_at});
  const availability=(slotId:string)=>{
    const slot=one('SELECT * FROM slots WHERE id=?',slotId); if(!slot) return undefined;
    const used=one("SELECT COALESCE(SUM(party_size),0) AS used FROM bookings WHERE slot_id=? AND status IN ('requested','confirmed')",slotId).used;
    return {id:slot.id,startsAt:slot.starts_at,capacity:slot.capacity,available:slot.capacity-used};
  };
  const history=(id:string)=>query('SELECT role,text,mode,created_at AS createdAt FROM (SELECT * FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 40) ORDER BY id',id);

  app.get('/api/status',(_req,res)=>res.json({city:'Ceuta',languages,ai:options.provider?'gemini':'local',reservations:'internal',esim:'unavailable',version:'0.1.0'}));
  app.get('/api/session',(req,res)=>{
    let user=getSession(req);
    if(!user) {
      const token=randomBytes(32).toString('hex');
      const profile={language:'es',interests:[],locationConsent:false,aiConsent:false};
      run('INSERT INTO sessions VALUES (?,?,?)',hash(token),JSON.stringify(profile),now());
      res.cookie('glovi_session',token,cookieOptions);
      user={profile:JSON.stringify(profile)};
    }
    res.json({profile:JSON.parse(user.profile)});
  });
  app.patch('/api/preferences',session,(req,res)=>{
    const changes=profileSchema.parse(req.body);
    const profile={...res.locals.profile,...changes};
    if(profile.interests) profile.interests=[...new Set(profile.interests)];
    run('UPDATE sessions SET profile=? WHERE id=?',JSON.stringify(profile),res.locals.session.id);
    res.json({profile});
  });
  app.get('/api/pois',(req,res)=>{
    const language=parseLanguage(req.query.language);
    const interest=req.query.interest===undefined?undefined:z.enum(interests).parse(req.query.interest);
    res.json({pois:pois.filter(p=>!interest||p.interests.includes(interest)).map(p=>({...localizedPoi(p,language),directionsUrl:directions(p.name+', Ceuta')}))});
  });
  app.get('/api/routes',(req,res)=>{
    const language=parseLanguage(req.query.language);
    res.json({routes:routes.map(r=>({...r,name:r.name[language]}))});
  });
  app.post('/api/tours',session,(req,res)=>{
    const {routeId}=z.object({routeId:z.string()}).strict().parse(req.body);
    if(!routes.some(r=>r.id===routeId)) fail(404,'route_not_found');
    const tour=transaction(()=>{
      const previous=currentTour(res.locals.session.id);
      if(previous?.status==='active') return previous;
      const id=randomUUID(); run('INSERT INTO tours (id,session_id,route_id,status,created_at) VALUES (?,?,?,?,?)',id,res.locals.session.id,routeId,'active',now());
      return one('SELECT * FROM tours WHERE id=?',id);
    });
    res.status(201).json({tour:tourJson(tour)});
  });
  app.get('/api/tours/current',session,(_req,res)=>res.json({tour:tourJson(currentTour(res.locals.session.id))}));
  app.delete('/api/tours/current',session,(_req,res)=>{
    run("UPDATE tours SET status='abandoned' WHERE session_id=? AND status='active'",res.locals.session.id);
    res.json({tour:tourJson(currentTour(res.locals.session.id))});
  });
  app.post('/api/location',session,(req,res)=>{
    if(!res.locals.profile.locationConsent) fail(403,'location_consent_required');
    const {latitude,longitude,accuracy}=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().min(0).max(100000)}).strict().parse(req.body);
    const tour=currentTour(res.locals.session.id);
    if(accuracy>100) return res.json({arrivals:[],reason:'low_accuracy',tour:tourJson(tour)});
    if(!tour||tour.status!=='active') return res.json({arrivals:[],reason:'no_active_tour',tour:tourJson(tour)});
    const route=routes.find(r=>r.id===tour.route_id)!; const visited=JSON.parse(tour.visited) as string[];
    const arrivals=pois.filter(p=>route.stops.includes(p.id)&&!visited.includes(p.id)&&distanceMeters(latitude,longitude,p.latitude,p.longitude)<=100);
    visited.push(...arrivals.map(p=>p.id));
    run('UPDATE tours SET visited=?,status=? WHERE id=?',JSON.stringify(visited),route.stops.every(id=>visited.includes(id))?'completed':'active',tour.id);
    res.json({arrivals:arrivals.map(p=>localizedPoi(p,res.locals.profile.language,res.locals.profile.interests)),tour:tourJson(currentTour(res.locals.session.id))});
  });
  app.get('/api/emergencies',(req,res)=>{
    const language=parseLanguage(req.query.language);
    res.json({phone:'112',steps:emergencySteps[language],services:emergencyServices,source:'https://www.ceuta.es/112/index.html',reviewedAt:'2026-09-24'});
  });
  app.get('/api/chat/history',session,(_req,res)=>res.json({messages:history(res.locals.session.id)}));
  app.post('/api/chat',session,async(req,res)=>{
    const {message}=z.object({message:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    const id=res.locals.session.id;
    if(inFlight.has(id)) fail(409,'chat_busy');
    const input={message,language:res.locals.profile.language as Language,interests:res.locals.profile.interests,history:history(id)};
    const result=localAnswer(input);
    inFlight.add(id);
    try {
      if(options.provider && res.locals.profile.aiConsent && result.intent==='visit') {
        try { result.answer=await options.provider(input); result.mode='gemini'; }
        catch { result.mode='local_fallback'; }
      }
      // The session may have been deleted while the provider was processing.
      if(!one('SELECT id FROM sessions WHERE id=?',id)) fail(401,'session_required');
      transaction(()=>{
        run('INSERT INTO messages(session_id,role,text,mode,created_at) VALUES(?,?,?,?,?)',id,'user',message,null,now());
        run('INSERT INTO messages(session_id,role,text,mode,created_at) VALUES(?,?,?,?,?)',id,'assistant',result.answer,result.mode,now());
        run('DELETE FROM messages WHERE session_id=? AND id NOT IN (SELECT id FROM messages WHERE session_id=? ORDER BY id DESC LIMIT 40)',id,id);
      });
      res.json(result);
    } finally {inFlight.delete(id);}
  });
  app.get('/api/services',(_req,res)=>{
    res.json({services:query('SELECT * FROM services ORDER BY rowid').map(s=>({...s,demo:!!s.demo,slots:query('SELECT id FROM slots WHERE service_id=? AND starts_at>? ORDER BY starts_at',s.id,now()).map(slot=>availability(slot.id))}))});
  });
  app.get('/api/bookings',session,(_req,res)=>res.json({bookings:query(bookingsSql+' WHERE b.session_id=? ORDER BY b.created_at DESC',res.locals.session.id).map(bookingJson)}));
  app.post('/api/bookings',session,(req,res)=>{
    const data=bookingSchema.parse(req.body); const {idempotencyKey,...payload}=data;
    const fingerprint=hash(JSON.stringify(payload)); const sessionId=res.locals.session.id;
    const result=transaction(()=>{
      const previous=one('SELECT * FROM bookings WHERE session_id=? AND idempotency_key=?',sessionId,idempotencyKey);
      if(previous) {
        if(previous.fingerprint!==fingerprint) fail(409,'idempotency_conflict');
        return {id:previous.id,repeated:true};
      }
      const slot=availability(data.slotId); if(!slot) fail(404,'slot_not_found');
      if(slot!.startsAt<=now()) fail(409,'slot_expired');
      if(slot!.available<data.partySize) fail(409,'slot_full');
      const id=randomUUID();
      run('INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,sessionId,data.slotId,data.partySize,data.name,data.contact,'requested',res.locals.profile.language,idempotencyKey,fingerprint,now());
      return {id,repeated:false};
    });
    res.status(result.repeated?200:201).json({booking:bookingJson(one(bookingsSql+' WHERE b.id=?',result.id))});
  });
  app.post('/api/bookings/:id/cancel',session,(req,res)=>{
    const booking=one('SELECT * FROM bookings WHERE id=? AND session_id=?',req.params.id,res.locals.session.id);
    if(!booking) fail(404,'booking_not_found');
    if(booking.status==='rejected') fail(409,'invalid_transition');
    run("UPDATE bookings SET status='cancelled' WHERE id=?",booking.id);
    res.json({booking:bookingJson(one(bookingsSql+' WHERE b.id=?',booking.id))});
  });
  app.get('/api/admin/bookings',admin,(_req,res)=>res.json({bookings:query(bookingsSql+' ORDER BY b.created_at DESC').map(bookingJson)}));
  app.patch('/api/admin/bookings/:id',admin,(req,res)=>{
    const {status}=z.object({status:z.enum(['confirmed','rejected'])}).strict().parse(req.body);
    const booking=one('SELECT * FROM bookings WHERE id=?',req.params.id);
    if(!booking) fail(404,'booking_not_found');
    if(booking.status!=='requested') fail(409,'invalid_transition');
    run('UPDATE bookings SET status=? WHERE id=?',status,booking.id);
    res.json({booking:bookingJson(one(bookingsSql+' WHERE b.id=?',booking.id))});
  });
  app.post('/api/admin/services',admin,(req,res)=>{
    const data=z.object({name:z.string().trim().min(2).max(120),kind:z.enum(['restaurant','experience']),description:z.string().trim().min(2).max(1000),demo:z.boolean()}).strict().parse(req.body);
    const id=randomUUID(); run('INSERT INTO services VALUES(?,?,?,?,?)',id,data.name,data.kind,data.description,data.demo?1:0);
    res.status(201).json({service:{id,...data}});
  });
  app.post('/api/admin/services/:id/slots',admin,(req,res)=>{
    const data=z.object({startsAt:z.iso.datetime({offset:true}),capacity:z.number().int().min(1).max(1000)}).strict().parse(req.body);
    const date=new Date(data.startsAt).toISOString();
    if(date<=now()) fail(400,'date_in_past');
    if(!one('SELECT id FROM services WHERE id=?',req.params.id)) fail(404,'service_not_found');
    if(one('SELECT id FROM slots WHERE service_id=? AND starts_at=?',req.params.id,date)) fail(409,'slot_exists');
    const id=randomUUID();run('INSERT INTO slots VALUES(?,?,?,?)',id,req.params.id,date,data.capacity);
    res.status(201).json({slot:availability(id)});
  });
  app.get('/api/privacy/export',session,(_req,res)=>{
    const id=res.locals.session.id;
    res.json({profile:res.locals.profile,messages:history(id),bookings:query(bookingsSql+' WHERE b.session_id=?',id).map(bookingJson),tours:query('SELECT * FROM tours WHERE session_id=?',id).map(tourJson)});
  });
  app.delete('/api/privacy',session,(_req,res)=>{
    run('DELETE FROM sessions WHERE id=?',res.locals.session.id);
    res.clearCookie('glovi_session',{...cookieOptions,maxAge:undefined});res.json({deleted:true});
  });
  app.use('/api',(_req,_res,next)=>next(new ApiError(404,'not_found')));
  app.use(express.static(resolve('dist')));
  app.get(['/','/widget','/admin'],(_req,res)=>res.sendFile(resolve('dist/index.html')));
  app.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof ZodError) return res.status(400).json({error:{code:'validation_error',fields:error.issues.map(i=>i.path.join('.'))}});
    if(error instanceof ApiError) return res.status(error.status).json({error:{code:error.code}});
    if(error.type==='entity.parse.failed') return res.status(400).json({error:{code:'invalid_json'}});
    if(error.type==='entity.too.large') return res.status(413).json({error:{code:'payload_too_large'}});
    console.error('Request failed:',error instanceof Error?error.message:'unknown');
    res.status(500).json({error:{code:'internal_error'}});
  });
  return {app,store,close:store.close};
}
