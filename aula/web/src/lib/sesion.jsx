import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SesionCtx = createContext(null);
export const useSesion = () => useContext(SesionCtx);

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = comprobando

  useEffect(() => {
    api.get('/auth/yo').then((r) => setUsuario(r.usuario)).catch(() => setUsuario(null));
  }, []);

  const entrar = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const salir = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUsuario(null);
  }, []);

  return <SesionCtx.Provider value={{ usuario, setUsuario, entrar, salir }}>{children}</SesionCtx.Provider>;
}

export const inicioSegunRol = (u) => (u?.rol === 'alumno' ? '/' : '/profesor');
