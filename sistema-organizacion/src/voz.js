import { useCallback, useEffect, useRef, useState } from 'react';

const DURACION_MAXIMA = 120;
const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const puedeGrabar = () => !!navigator.mediaDevices?.getUserMedia && 'MediaRecorder' in window;
export const puedeLeer = () => 'speechSynthesis' in window;

export const aBase64 = blob => new Promise((ok, ko) => {
  const lector = new FileReader();
  lector.onload = () => ok(String(lector.result).split(',')[1]);
  lector.onerror = () => ko(new Error('No se pudo leer el audio'));
  lector.readAsDataURL(blob);
});

function mensajeDeMicrofono(e) {
  if (e.name === 'NotAllowedError') return 'Permite el micrófono en los permisos de esta web y vuelve a probar.';
  if (e.name === 'NotFoundError') return 'No se encuentra ningún micrófono.';
  return `No se pudo usar el micrófono: ${e.message}`;
}

/** `alTerminar` recibe el audio grabado. Cancelar suelta el micrófono y descarta la grabación. */
export function useGrabadora({ alTerminar, alFallar }) {
  const [segundos, setSegundos] = useState(null); // null = sin grabar
  const actual = useRef(null);
  const devoluciones = useRef();
  devoluciones.current = { alTerminar, alFallar };

  const soltar = useCallback(() => {
    const g = actual.current;
    if (!g) return;
    clearInterval(g.reloj);
    g.flujo?.getTracks().forEach(t => t.stop());
    actual.current = null;
    setSegundos(null);
  }, []);

  const parar = useCallback(() => {
    const g = actual.current;
    if (g?.grabadora?.state === 'recording') g.grabadora.stop();
  }, []);

  const cancelar = useCallback(() => {
    const g = actual.current;
    if (!g) return;
    g.cancelada = true;
    if (g.grabadora?.state === 'recording') g.grabadora.stop();
    soltar();
  }, [soltar]);

  const empezar = useCallback(async () => {
    if (actual.current) return;
    const g = { partes: [], cancelada: false };
    actual.current = g;
    setSegundos(0);
    try {
      g.flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (g.cancelada) { g.flujo.getTracks().forEach(t => t.stop()); return; } // se canceló mientras pedía permiso
      const mimeType = FORMATOS.find(f => MediaRecorder.isTypeSupported(f));
      g.grabadora = new MediaRecorder(g.flujo, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      g.grabadora.ondataavailable = e => { if (e.data.size) g.partes.push(e.data); };
      g.grabadora.onstop = () => {
        const cancelada = g.cancelada;
        const tipo = g.grabadora.mimeType;
        soltar();
        if (!cancelada) devoluciones.current.alTerminar(new Blob(g.partes, { type: tipo }));
      };
      g.grabadora.start();
      let pasados = 0;
      g.reloj = setInterval(() => {
        pasados++;
        setSegundos(pasados);
        if (pasados >= DURACION_MAXIMA) parar();
      }, 1000);
    } catch (e) {
      soltar();
      devoluciones.current.alFallar(mensajeDeMicrofono(e));
    }
  }, [parar, soltar]);

  useEffect(() => cancelar, [cancelar]);

  return { grabando: segundos !== null, segundos, empezar, parar, cancelar };
}

// Chrome corta en silencio las locuciones largas: se leen frase a frase.
const enFrases = texto => texto.split(/(?<=[.!?…:])\s+|\n+/).map(f => f.trim()).filter(Boolean);

/** Lee con las voces del propio dispositivo: no gasta cuota ni envía nada. */
export function useLectura() {
  const [leyendo, setLeyendo] = useState(null);
  const turno = useRef(0);
  const enCola = useRef([]); // Chrome puede perder el evento de fin si nadie conserva la locución

  const parar = useCallback(() => {
    turno.current++;
    enCola.current = [];
    if (puedeLeer()) speechSynthesis.cancel();
    setLeyendo(null);
  }, []);

  const alternar = useCallback((id, texto) => {
    const yaEsta = leyendo === id;
    parar();
    if (yaEsta) return;
    const miTurno = turno.current;
    const voz = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('es'));
    const frases = enFrases(texto);
    const terminar = () => { if (turno.current === miTurno) setLeyendo(null); };
    enCola.current = frases.map((frase, i) => {
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = voz?.lang || 'es-ES';
      if (voz) u.voice = voz;
      u.onerror = terminar;
      if (i === frases.length - 1) u.onend = terminar;
      return u;
    });
    setLeyendo(id);
    enCola.current.forEach(u => speechSynthesis.speak(u));
  }, [leyendo, parar]);

  useEffect(() => parar, [parar]);

  return { leyendo, alternar, parar };
}
