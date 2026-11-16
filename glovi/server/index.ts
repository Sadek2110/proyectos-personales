import { createApp } from './app.ts';
import { geminiProvider } from './assistant.ts';
const port=Number(process.env.PORT??3200);
const instance=createApp({
  databasePath:process.env.DATABASE_PATH,
  adminToken:process.env.ADMIN_TOKEN,
  provider:process.env.GEMINI_API_KEY&&process.env.GEMINI_MODEL?geminiProvider(process.env.GEMINI_API_KEY,process.env.GEMINI_MODEL):undefined,
  cookieSecure:process.env.COOKIE_SECURE==='true',
  publicOrigin:process.env.PUBLIC_ORIGIN,
  embedOrigins:process.env.EMBED_ORIGINS?.split(/\s+/)
});
const server=instance.app.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`GLOVI: http://${process.env.HOST??'127.0.0.1'}:${port}`));
for(const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>server.close(()=>{instance.close();process.exit(0);}));
