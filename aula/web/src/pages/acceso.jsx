import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Marca } from '../components/layouts.jsx';
import { Boton, Campo, ConDatos, Icono, Tarjeta } from '../components/ui.jsx';
import { api, useApi } from '../lib/api.js';
import { inicioSegunRol, useSesion } from '../lib/sesion.jsx';

function Pantalla({ children }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-borde bg-white px-4 py-3">
        <div className="mx-auto max-w-md"><Marca /></div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">{children}</main>
      <footer className="px-4 pb-6 text-center text-sm text-texto-2">
        Cámara de Comercio de Ceuta · Competencias Digitales · <Link to="/privacidad" className="font-bold underline">Privacidad</Link>
      </footer>
    </div>
  );
}

function CampoPassword({ etiqueta, ...props }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Campo etiqueta={etiqueta} tipo={ver ? 'text' : 'password'} {...props} />
      <button type="button" onClick={() => setVer(!ver)} className="absolute right-2 bottom-1.5 flex min-h-11 items-center gap-1 rounded-lg px-3 font-bold text-marca-oscuro hover:bg-marca-suave">
        <Icono nombre={ver ? 'visibility_off' : 'visibility'} />{ver ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}

export function Acceso() {
  const { usuario, entrar } = useSesion();
  const navegar = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={inicioSegunRol(usuario)} replace />;

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await entrar(email, password);
      // Vuelve a la página que se intentaba abrir, si corresponde a su rol
      const desde = loc.state?.desde;
      const valida = desde && (u.rol === 'alumno') !== desde.startsWith('/profesor');
      navegar(valida ? desde : inicioSegunRol(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <h1 className="text-3xl font-bold">Bienvenido al curso</h1>
      <p className="mt-2 mb-6 text-texto-2">Entra con el correo con el que te invitaron y tu contraseña.</p>
      <Tarjeta>
        <form onSubmit={enviar} className="flex flex-col gap-5">
          <Campo etiqueta="Correo electrónico" tipo="email" autoComplete="email" inputMode="email" placeholder="ejemplo@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <CampoPassword etiqueta="Contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="flex items-start gap-2 rounded-xl bg-marca-suave p-3 font-bold text-marca-oscuro" role="alert"><Icono nombre="error" />{error}</p>}
          <Boton type="submit" iconoFinal="arrow_forward" cargando={enviando}>Entrar</Boton>
        </form>
      </Tarjeta>
      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-marca-suave p-4">
        <Icono nombre="help" className="text-marca-oscuro" />
        <p><strong>¿Has olvidado la contraseña?</strong> Díselo al profesor y te enviará un enlace para poner una nueva.</p>
      </div>
    </Pantalla>
  );
}

export function Invitacion() {
  const { token } = useParams();
  const consulta = useApi(`/auth/invitacion/${token}`);
  const { setUsuario } = useSesion();
  const navegar = useNavigate();
  const [form, setForm] = useState({ nombre: '', password: '', repetir: '', consentimiento: false });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <Pantalla>
      <ConDatos consulta={consulta}>
        {(inv) => {
          const reset = inv.tipo === 'reset';
          async function enviar(e) {
            e.preventDefault();
            setError('');
            if (form.password.length < 8) return setError('La contraseña tiene que tener al menos 8 letras o números.');
            if (form.password !== form.repetir) return setError('Las dos contraseñas no son iguales. Escríbelas otra vez.');
            setEnviando(true);
            try {
              const r = await api.post(`/auth/invitacion/${token}`, { nombre: reset ? undefined : form.nombre, password: form.password, consentimiento: form.consentimiento });
              setUsuario(r.usuario);
              navegar(inicioSegunRol(r.usuario), { replace: true });
            } catch (err) {
              setError(err.message);
              setEnviando(false);
            }
          }
          return (
            <>
              <section className="mb-6 rounded-2xl bg-marca p-6 text-white shadow-sm">
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-bold text-marca-oscuro uppercase">
                  <span className="size-2.5 rounded-full bg-amarillo" />{reset ? 'Nueva contraseña' : 'Invitación recibida'}
                </p>
                <h1 className="text-2xl font-bold text-white">{reset ? 'Elige una contraseña nueva' : 'Te han invitado al curso de Competencias Digitales'}</h1>
                {!reset && <p className="mt-3 flex items-center gap-2 text-white/90"><Icono nombre="calendar_month" className="text-amarillo" />Empieza el jueves 8 de octubre</p>}
              </section>
              {!reset && (
                <p className="mb-5 flex items-start gap-3 rounded-xl border border-marca-borde bg-marca-suave p-4 text-marca-oscuro">
                  <Icono nombre="info" /><span><strong>Solo tienes que hacer esto una vez.</strong> Después entrarás con tu correo y tu contraseña.</span>
                </p>
              )}
              <Tarjeta>
                <form onSubmit={enviar} className="flex flex-col gap-5">
                  <Campo etiqueta="Tu correo electrónico" value={inv.email} readOnly disabled ayuda="Es el correo donde recibiste la invitación." />
                  {!reset && <Campo etiqueta="Nombre y apellidos" autoComplete="name" placeholder="Ej. Francisco García López" value={form.nombre} onChange={cambiar('nombre')} required minLength={2} />}
                  <CampoPassword etiqueta={reset ? 'Contraseña nueva' : 'Crea una contraseña'} autoComplete="new-password" placeholder="Al menos 8 letras o números" value={form.password} onChange={cambiar('password')} required />
                  <CampoPassword etiqueta="Repite la contraseña" autoComplete="new-password" value={form.repetir} onChange={cambiar('repetir')} required />
                  {!reset && inv.rol === 'alumno' && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-4">
                      <input type="checkbox" className="mt-1 size-6 shrink-0 accent-marca" checked={form.consentimiento} onChange={cambiar('consentimiento')} required />
                      <span>Acepto que mis datos de asistencia y ejercicios se usen para el seguimiento del curso. <Link to="/privacidad" target="_blank" className="font-bold text-marca-oscuro underline">Más información</Link></span>
                    </label>
                  )}
                  {error && <p className="flex items-start gap-2 rounded-xl bg-marca-suave p-3 font-bold text-marca-oscuro" role="alert"><Icono nombre="error" />{error}</p>}
                  <Boton type="submit" iconoFinal="arrow_forward" cargando={enviando}>{reset ? 'Guardar contraseña' : 'Crear mi cuenta'}</Boton>
                </form>
              </Tarjeta>
            </>
          );
        }}
      </ConDatos>
    </Pantalla>
  );
}

const CONTACTO = 'sadekjoud@gmail.com';

function Apartado({ icono, titulo, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Icono nombre={icono} className="text-marca-oscuro" />{titulo}</h2>
      {children}
    </section>
  );
}

// Página pública: la enlazan el registro y el acceso, y es la política de privacidad de la app de Google
export function Privacidad() {
  return (
    <Pantalla>
      <h1 className="text-3xl font-bold">Privacidad</h1>
      <p className="mt-2 mb-6 text-texto-2">Qué datos guarda el Aula Conserjería, para qué y cómo puedes pedir que se borren.</p>
      <Tarjeta className="flex flex-col gap-6">
        <Apartado icono="person" titulo="Quién es el responsable">
          <p>El aula la gestiona el profesor del curso de Competencias Digitales para conserjería de la Cámara de Comercio de Ceuta. Para cualquier duda sobre tus datos escribe a <a href={`mailto:${CONTACTO}`} className="font-bold text-marca-oscuro underline">{CONTACTO}</a>.</p>
        </Apartado>
        <Apartado icono="badge" titulo="Qué datos guardamos">
          <ul className="list-disc space-y-1 pl-6">
            <li>Tu nombre y apellidos, tu correo y tu grupo.</li>
            <li>Las horas a las que fichas la entrada y la salida, y tu asistencia a cada clase.</li>
            <li>Los ejercicios que entregas, con sus notas y los comentarios del profesor.</li>
          </ul>
        </Apartado>
        <Apartado icono="flag" titulo="Para qué">
          <p>Solo para organizar el curso y seguir tu asistencia y tu aprendizaje. No se usan para publicidad, no se venden y no se ceden a nadie.</p>
        </Apartado>
        <Apartado icono="cloud" titulo="Dónde se guardan">
          <p>En el servidor del aula y en el Google Drive del profesor: una hoja de seguimiento y una carpeta con las entregas, que solo ve el profesor. Los correos de invitación se envían desde el Gmail del profesor.</p>
          <p>El aula usa Google Sheets, Google Drive y Gmail únicamente con la cuenta del profesor. Nunca accede a tu cuenta de Google. El uso de la información recibida de las API de Google cumple la Política de datos de usuario de los servicios de API de Google, incluidos sus requisitos de uso limitado.</p>
        </Apartado>
        <Apartado icono="schedule" titulo="Cuánto tiempo">
          <p>Mientras dure el curso y el tiempo que la Cámara de Comercio necesite para justificarlo. Después se borran.</p>
        </Apartado>
        <Apartado icono="cookie" titulo="Cookies">
          <p>Solo una cookie técnica para que no tengas que escribir tu contraseña cada vez que entras. No hay cookies de publicidad ni de estadísticas.</p>
        </Apartado>
        <Apartado icono="verified_user" titulo="Tus derechos">
          <p>Puedes pedir ver, corregir o borrar tus datos escribiendo a <a href={`mailto:${CONTACTO}`} className="font-bold text-marca-oscuro underline">{CONTACTO}</a> o diciéndoselo al profesor en clase. Si no quedas conforme, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" className="font-bold text-marca-oscuro underline">aepd.es</a>).</p>
        </Apartado>
        <p className="text-sm text-texto-2">Última actualización: 6 de octubre de 2026.</p>
      </Tarjeta>
      <Link to="/acceso" className="mt-6 flex min-h-14 items-center justify-center gap-2 rounded-xl font-bold text-marca-oscuro hover:bg-marca-suave">
        <Icono nombre="arrow_back" />Volver al aula
      </Link>
    </Pantalla>
  );
}
