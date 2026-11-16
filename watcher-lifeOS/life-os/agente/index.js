// Une las piezas del agente y expone lo que usa server.js.
'use strict';
const { crearAlmacen } = require('./almacen.js');
const { crearChat } = require('./chat.js');
const { crearModelo } = require('./gemini.js');
const { crearHerramientas } = require('./herramientas.js');
const { crearMcp } = require('./mcp.js');
const { crearPlanificador } = require('./planificador.js');
const { crearPush } = require('./push.js');
const { crearAlmacenTemario } = require('./temario.js');

function validarPrefs(p) {
  const limpio = {};
  for (const k of ['resumen', 'eventos', 'tareas', 'sugerencias']) if (typeof p?.[k] === 'boolean') limpio[k] = p[k];
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(p?.horaResumen || '')) limpio.horaResumen = p.horaResumen;
  const min = Number(p?.minutosEvento);
  if (Number.isInteger(min) && min >= 1 && min <= 180) limpio.minutosEvento = min;
  return limpio;
}

function crearAgente({ llamarGoogle, modelo, directorio, urlApp, tz, igual, leerCuerpo, json }) {
  const almacen = crearAlmacen(directorio);
  const almacenTemario = crearAlmacenTemario(directorio);
  const { estado, guardar } = almacen;
  const herramientas = crearHerramientas({ llamarGoogle, tz, almacenTemario, directorio });
  const chat = crearChat({ almacen, herramientas, modelo, tz });
  const push = crearPush({ almacen, asunto: urlApp });
  const planificador = crearPlanificador({ almacen, almacenTemario, directorio, llamarGoogle, modelo, push, tz });
  const origen = new URL(urlApp).origin;

  const vistaEstado = () => ({ ...chat.estado(), prefs: estado.prefs, clavePublica: push.clavePublica });

  const API = {
    estado: vistaEstado,
    chat: async mensaje => ({ ...(await chat.enviar(mensaje)), estado: vistaEstado() }),
    confirmar: async (id, aceptar) => ({ ...(await chat.confirmar(id, aceptar === true)), estado: vistaEstado() }),
    vaciar: () => { chat.vaciar(); return vistaEstado(); },
    transcribir: (audio, tipo) => chat.transcribir(audio, tipo),
    prefs: p => { Object.assign(estado.prefs, validarPrefs(p)); guardar(); return vistaEstado(); },
    suscribir: s => { push.suscribir(s); return true; },
    desuscribir: endpoint => { push.desuscribir(endpoint); return true; },
    probar: async () => {
      const { entregados } = await push.enviar({ clave: `prueba:${Date.now()}`, titulo: 'Life OS', cuerpo: 'Los avisos funcionan en este dispositivo.', tab: 'agente', ttl: 300 });
      if (!entregados) throw new Error('No se pudo entregar el aviso de prueba');
      return true;
    },
    // Aparte de "estado": lo que devuelve "estado" se guarda en la caché del navegador.
    mcp: () => ({ url: `${origen}/mcp`, token: estado.claves.mcp }),
    temario: () => almacenTemario.obtener(),
  };

  return {
    tiene: nombre => Object.hasOwn(API, nombre),
    llamar: (nombre, args) => API[nombre](...args),
    temario: () => almacenTemario.obtener(),
    ingestarClase: lote => almacenTemario.ingestar(lote),
    revisarPlanificador: () => planificador.revisar(),
    mcp: crearMcp({ herramientas, origen, leerCuerpo, json, tokenValido: t => igual(t, estado.claves.mcp) }),
    iniciar: () => planificador.iniciar(),
  };
}

module.exports = { crearAgente, crearModelo };
