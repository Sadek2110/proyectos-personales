import { useState } from 'react';
import { Avatar, Boton, Campo, Tarjeta, Titulo, useAviso } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useSesion } from '../../lib/sesion.jsx';

export function Cuenta() {
  const { usuario, salir } = useSesion();
  const avisar = useAviso();
  const [form, setForm] = useState({ actual: '', nueva: '' });
  const [enviando, setEnviando] = useState(false);

  async function cambiar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post('/auth/password', form);
      avisar('Contraseña cambiada.');
      setForm({ actual: '', nueva: '' });
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Titulo titulo="Mi cuenta" />
      <div className="flex flex-col gap-5">
        <Tarjeta className="flex items-center gap-4">
          <Avatar nombre={usuario.nombre} className="size-16 text-2xl" />
          <div className="min-w-0">
            <p className="text-xl font-bold">{usuario.nombre}</p>
            <p className="truncate text-texto-2">{usuario.email}</p>
            {usuario.alumno_id && <p className="text-texto-2">Tu número de alumno: <strong className="text-texto">{usuario.alumno_id}</strong></p>}
          </div>
        </Tarjeta>
        {usuario.alumno_id && (
          <p className="rounded-2xl bg-pendiente p-4 text-pendiente-texto">
            Pon <strong>{usuario.alumno_id}</strong> al principio del nombre de los archivos que entregues. Por ejemplo: {usuario.alumno_id}_T01_Prueba.docx
          </p>
        )}
        <Tarjeta>
          <h2 className="mb-4 text-xl font-bold">Cambiar la contraseña</h2>
          <form onSubmit={cambiar} className="flex flex-col gap-4">
            <Campo etiqueta="Contraseña actual" tipo="password" autoComplete="current-password" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} required />
            <Campo etiqueta="Contraseña nueva" tipo="password" autoComplete="new-password" ayuda="Al menos 8 letras o números." value={form.nueva} onChange={(e) => setForm({ ...form, nueva: e.target.value })} required minLength={8} />
            <Boton type="submit" variante="secundario" cargando={enviando}>Guardar contraseña</Boton>
          </form>
        </Tarjeta>
        <Boton variante="peligro" icono="logout" onClick={salir}>Cerrar sesión</Boton>
        <p className="text-center text-texto-2">Si usas un ordenador compartido, cierra la sesión al terminar.</p>
      </div>
    </>
  );
}
