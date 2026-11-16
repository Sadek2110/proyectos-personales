import { useCallback, useEffect, useState } from 'react';

async function peticion(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: {} };
  if (cuerpo instanceof FormData) opciones.body = cuerpo;
  else if (cuerpo !== undefined) {
    opciones.headers['content-type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  let res;
  try {
    res = await fetch(`/api${ruta}`, opciones);
  } catch {
    throw new Error('No hay conexión. Comprueba el wifi o los datos del móvil e inténtalo de nuevo.');
  }
  const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(datos?.error || 'Algo ha fallado. Inténtalo de nuevo.');
    err.status = res.status;
    throw err;
  }
  return datos;
}

export const api = {
  get: (ruta) => peticion('GET', ruta),
  post: (ruta, cuerpo) => peticion('POST', ruta, cuerpo ?? {}),
  put: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo ?? {}),
  patch: (ruta, cuerpo) => peticion('PATCH', ruta, cuerpo ?? {}),
  del: (ruta) => peticion('DELETE', ruta),
};

/** Carga datos de la API: { datos, error, cargando, recargar } */
export function useApi(ruta) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  const cargar = useCallback(async () => {
    if (!ruta) return;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const datos = await api.get(ruta);
      setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      setEstado({ datos: null, error, cargando: false });
    }
  }, [ruta]);
  useEffect(() => {
    cargar();
  }, [cargar]);
  return { ...estado, recargar: cargar };
}
