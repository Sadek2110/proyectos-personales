import { app } from './app.js';
import { config } from './config.js';
import { migrar } from './db.js';
import { arrancarCola } from './lib/n8n.js';
import { sembrar } from './seed.js';

await migrar();
await sembrar();
arrancarCola();
app.listen(config.puerto, () => console.log(`Aula Conserjería escuchando en el puerto ${config.puerto}`));
