import { useState } from 'react';
import { Boton, Chip, ConDatos, Icono, Pestanas, Tarjeta, Titulo, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaHora } from '../../lib/formato.js';

const EVENTOS = [
  ['alumno.alta', 'Alumno se registra', 'Añadir fila en la hoja Alumnos y crear su carpeta de entregas'],
  ['invitacion.creada', 'Invitación creada', 'Enviar el correo con Gmail (asunto y texto ya vienen preparados)'],
  ['fichaje.entrada / fichaje.salida', 'Fichaje', 'Registrar la hora de entrada y salida'],
  ['asistencia.actualizada', 'Asistencia', 'Actualizar la hoja Asistencia por asistencia_id'],
  ['sesion.guardada', 'Sesión creada o editada', 'Actualizar la hoja Sesiones por sesion_id'],
  ['entrega.creada', 'Entrega de un ejercicio', 'Descargar archivo_url (cabecera X-API-Key), subirlo a «03 Entregas de alumnos» y anotar en Resultados'],
  ['resultado.revisado', 'Corrección', 'Actualizar la fila de Resultados a Revisado con nota y autonomía'],
  ['sesion.cerrada', 'Cierre de la clase', 'Crear la entrada del día en el Diario del profesor de Notion'],
];

const ESTADO_CHIP = { enviado: 'Revisado', pendiente: 'Pendiente', error: 'Ausente' };

export function Integraciones() {
  const [estado, setEstado] = useState('');
  const consulta = useApi(`/admin/integraciones${estado ? `?estado=${estado}` : ''}`);
  const avisar = useAviso();
  const [abierto, setAbierto] = useState(null);

  async function accion(ruta, texto) {
    try {
      await api.post(ruta);
      avisar(texto);
      setTimeout(consulta.recargar, 1500);
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <>
      <Titulo titulo="Integraciones n8n" subtitulo="Cada cambio importante se envía a n8n para actualizar el Sheet de seguimiento, Drive y Notion." accion={<Boton icono="send" onClick={() => accion('/admin/integraciones/prueba', 'Evento de prueba en cola.')}>Enviar prueba</Boton>} />
      <ConDatos consulta={consulta}>
        {(d) => (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Tarjeta>
                <p className="font-bold">Webhook de n8n</p>
                <p className={`mt-1 flex items-center gap-2 ${d.configuracion.webhook ? 'text-revisado-texto' : 'text-marca-oscuro'}`}>
                  <Icono nombre={d.configuracion.webhook ? 'check_circle' : 'error'} />{d.configuracion.webhook ? 'Conectado' : 'Falta N8N_WEBHOOK_URL'}
                </p>
                {!d.configuracion.secreto && d.configuracion.webhook && <p className="mt-1 text-sm text-texto-2">Recomendado: definir N8N_WEBHOOK_SECRET.</p>}
              </Tarjeta>
              <Tarjeta>
                <p className="font-bold">API para n8n</p>
                <p className={`mt-1 flex items-center gap-2 ${d.configuracion.api_key ? 'text-revisado-texto' : 'text-marca-oscuro'}`}>
                  <Icono nombre={d.configuracion.api_key ? 'check_circle' : 'error'} />{d.configuracion.api_key ? 'Clave configurada' : 'Falta INTEGRACIONES_API_KEY'}
                </p>
                <p className="mt-1 text-sm break-all text-texto-2">{d.configuracion.app_url}/api/integraciones</p>
              </Tarjeta>
              <Tarjeta>
                <p className="font-bold">Cola de eventos</p>
                <p className="mt-1">{d.resumen.enviado || 0} enviados · {d.resumen.pendiente || 0} pendientes · <span className={d.resumen.error ? 'font-bold text-marca-oscuro' : ''}>{d.resumen.error || 0} con error</span></p>
              </Tarjeta>
            </div>

            <details className="rounded-2xl border border-borde bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-xl font-bold">Eventos que recibe n8n</summary>
              <p className="mt-3 text-texto-2">Todos llegan al mismo webhook con <code>{'{ evento, id_evento, fecha, curso_id, datos }'}</code>. Usa un nodo Switch por <code>evento</code>. Los campos de <code>datos</code> se llaman igual que las columnas del Sheet. Si un evento llega dos veces, <code>id_evento</code> es el mismo: actualiza por ID y no se duplicará.</p>
              <ul className="mt-3 divide-y divide-borde">
                {EVENTOS.map(([ev, nombre, accionN8n]) => (
                  <li key={ev} className="py-2"><code className="font-bold text-marca-oscuro">{ev}</code> · <strong>{nombre}</strong><br /><span className="text-texto-2">{accionN8n}</span></li>
                ))}
              </ul>
            </details>

            <div>
              <Pestanas valor={estado} cambiar={setEstado} opciones={[['', 'Todos'], ['pendiente', 'Pendientes'], ['error', 'Con error'], ['enviado', 'Enviados']]} />
              <div className="overflow-hidden rounded-2xl border border-borde bg-white shadow-sm">
                {d.eventos.length === 0 && <p className="p-6 text-center text-texto-2">No hay eventos.</p>}
                <ul className="divide-y divide-borde">
                  {d.eventos.map((e) => (
                    <li key={e.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-texto-2">#{e.id}</span>
                        <code className="font-bold">{e.evento}</code>
                        <span className="flex-1 text-sm text-texto-2">{fechaHora(e.creado_en)} · {e.intentos} intento(s)</span>
                        <Chip estado={ESTADO_CHIP[e.estado]}>{e.estado}</Chip>
                        <Boton variante="texto" onClick={() => setAbierto(abierto === e.id ? null : e.id)}>{abierto === e.id ? 'Ocultar' : 'Ver datos'}</Boton>
                        {e.estado !== 'enviado' && <Boton variante="texto" icono="replay" onClick={() => accion(`/admin/integraciones/${e.id}/reintentar`, 'Se reintentará ahora.')}>Reintentar</Boton>}
                      </div>
                      {e.ultimo_error && <p className="mt-1 text-sm font-bold text-marca-oscuro">{e.ultimo_error}</p>}
                      {abierto === e.id && <pre className="mt-2 overflow-x-auto rounded-xl bg-fondo p-3 text-sm">{JSON.stringify(e.payload, null, 2)}</pre>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </ConDatos>
    </>
  );
}
