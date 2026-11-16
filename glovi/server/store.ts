import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openStore(path:string) {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, profile TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, text TEXT NOT NULL, mode TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tours (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, route_id TEXT NOT NULL, status TEXT NOT NULL, visited TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, description TEXT NOT NULL, demo INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id), starts_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>0), UNIQUE(service_id,starts_at));
    CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, slot_id TEXT NOT NULL REFERENCES slots(id), party_size INTEGER NOT NULL CHECK(party_size>0), name TEXT NOT NULL, contact TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('requested','confirmed','cancelled','rejected')), language TEXT NOT NULL, idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_id,idempotency_key));
    CREATE INDEX IF NOT EXISTS booking_slot ON bookings(slot_id,status);
    CREATE INDEX IF NOT EXISTS message_session ON messages(session_id,id);
    CREATE INDEX IF NOT EXISTS tour_session ON tours(session_id,created_at);
    PRAGMA user_version=1;`);
  const query = <T = any>(sql:string,...args:any[]): T[] => db.prepare(sql).all(...args) as T[];
  const one = <T = any>(sql:string,...args:any[]): T|undefined => db.prepare(sql).get(...args) as T|undefined;
  const run = (sql:string,...args:any[]) => db.prepare(sql).run(...args);
  const transaction = <T>(work:()=>T): T => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = work(); db.exec('COMMIT'); return value; }
    catch(error) { db.exec('ROLLBACK'); throw error; }
  };
  if(!one('SELECT id FROM services LIMIT 1')) transaction(()=> {
    run('INSERT INTO services VALUES (?,?,?,?,?)','demo-restaurant','Restaurante de demostración','restaurant','Reserva de prueba: no corresponde a un establecimiento real.',1);
    run('INSERT INTO services VALUES (?,?,?,?,?)','demo-tour','Paseo cultural de demostración','experience','Experiencia de prueba: sin operador turístico real.',1);
    for(let day=1;day<=7;day++) for(const id of ['demo-restaurant','demo-tour']) {
      const date=new Date(); date.setUTCDate(date.getUTCDate()+day); date.setUTCHours(id==='demo-restaurant'?18:9,0,0,0);
      run('INSERT INTO slots VALUES (?,?,?,?)',randomUUID(),id,date.toISOString(),8);
    }
  });
  return {db,query,one,run,transaction,close:()=>db.close()};
}
