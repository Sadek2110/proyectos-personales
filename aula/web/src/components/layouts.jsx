import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { inicioSegunRol, useSesion } from '../lib/sesion.jsx';
import { Avatar, Cargando, Icono } from './ui.jsx';

export function Marca({ claro = false, subtitulo = 'Cámara de Ceuta' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca text-white shadow-sm">
        <Icono nombre="school" relleno className="text-2xl" />
        <span className="absolute -top-1 -right-1 size-3.5 rounded-full border-2 border-white bg-amarillo" />
      </span>
      <span className="leading-tight">
        <span className={`block font-titulo text-lg font-bold ${claro ? 'text-white' : 'text-texto'}`}>Aula Conserjería</span>
        <span className={`block text-xs font-bold tracking-wider uppercase ${claro ? 'text-amarillo' : 'text-marca'}`}>{subtitulo}</span>
      </span>
    </div>
  );
}

/** Protege rutas según el rol */
export function Requiere({ rol, children }) {
  const { usuario } = useSesion();
  const loc = useLocation();
  if (usuario === undefined) return <Cargando />;
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: loc.pathname }} />;
  const permitido = rol === 'alumno' ? usuario.rol === 'alumno' : rol === 'admin' ? usuario.rol === 'admin' : usuario.rol !== 'alumno';
  if (!permitido) return <Navigate to={inicioSegunRol(usuario)} replace />;
  return children;
}

const NAV_ALUMNO = [
  ['/', 'home', 'Inicio'],
  ['/calendario', 'calendar_month', 'Calendario'],
  ['/temario', 'menu_book', 'Temario'],
  ['/ejercicios', 'assignment', 'Ejercicios'],
];

export function LayoutAlumno() {
  const { usuario } = useSesion();
  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: barra lateral */}
      <aside className="no-imprimir sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-borde bg-white p-5 lg:flex">
        <Marca />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Menú principal">
          {[...NAV_ALUMNO, ['/cuenta', 'person', 'Mi cuenta']].map(([to, icono, texto]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
              `flex min-h-14 items-center gap-3 rounded-xl px-4 text-lg font-bold ${isActive ? 'bg-marca text-white' : 'text-texto hover:bg-fondo'}`}>
              <Icono nombre={icono} />{texto}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl bg-fondo p-3">
          <Avatar nombre={usuario.nombre} />
          <div className="min-w-0">
            <p className="truncate font-bold">{usuario.nombre}</p>
            <p className="text-sm text-texto-2">{usuario.alumno_id}</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Móvil: cabecera */}
        <header className="no-imprimir sticky top-0 z-30 flex items-center justify-between border-b border-borde bg-white px-4 py-3 lg:hidden">
          <Marca />
          <NavLink to="/cuenta" aria-label="Mi cuenta"><Avatar nombre={usuario.nombre} /></NavLink>
        </header>
        <main className="mx-auto max-w-3xl px-4 pt-5 pb-32 lg:px-8 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Móvil: barra inferior */}
      <nav className="no-imprimir fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Menú principal">
        <div className="mx-auto flex max-w-md justify-around px-2 py-1.5">
          {NAV_ALUMNO.map(([to, icono, texto]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
              `flex min-h-14 min-w-18 flex-col items-center justify-center rounded-xl px-2 text-sm ${isActive ? 'bg-marca-suave font-bold text-marca-oscuro' : 'text-texto-2'}`}>
              {({ isActive }) => (<><Icono nombre={icono} relleno={isActive} className="text-[26px]" />{texto}</>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function LayoutProfesor() {
  const { usuario, salir } = useSesion();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);

  const enlaces = [
    ['/profesor', 'dashboard', 'Panel'],
    ['/profesor/sesiones', 'event_available', 'Sesiones y asistencia'],
    ['/profesor/alumnos', 'group', 'Alumnos e invitaciones'],
    ['/profesor/correcciones', 'rate_review', 'Correcciones'],
    ['/profesor/temario', 'menu_book', 'Temario y ejercicios'],
    ['/profesor/calendario', 'calendar_month', 'Avisos del calendario'],
    ...(usuario.rol === 'admin' ? [['/profesor/datos', 'database', 'Gestión de datos'], ['/profesor/integraciones', 'hub', 'Integraciones n8n']] : []),
  ];

  const lateral = (
    <div className="flex h-full flex-col bg-negro p-5 text-white">
      <Marca claro subtitulo={usuario.rol === 'admin' ? 'Administración' : 'Profesorado'} />
      <nav className="mt-8 flex flex-col gap-1" aria-label="Menú del profesor">
        {enlaces.map(([to, icono, texto]) => (
          <NavLink key={to} to={to} end={to === '/profesor'} className={({ isActive }) =>
            `flex min-h-12 items-center gap-3 rounded-xl px-4 font-bold ${isActive ? 'bg-marca text-white' : 'text-[#CFCFCF] hover:bg-white/10 hover:text-white'}`}>
            <Icono nombre={icono} />{texto}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/15 pt-4">
        <div className="flex items-center gap-3">
          <Avatar nombre={usuario.nombre} />
          <div className="min-w-0">
            <p className="truncate font-bold">{usuario.nombre}</p>
            <p className="text-sm text-[#CFCFCF]">{usuario.rol === 'admin' ? 'Administrador' : 'Profesor'}</p>
          </div>
        </div>
        <button type="button" onClick={salir} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl px-4 font-bold text-[#F0A8AE] hover:bg-white/10">
          <Icono nombre="logout" />Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 lg:block">{lateral}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-negro px-4 py-3 lg:hidden">
        <Marca claro subtitulo="Profesorado" />
        <button type="button" onClick={() => setMenu(true)} className="flex size-12 items-center justify-center rounded-xl text-white hover:bg-white/10" aria-label="Abrir menú">
          <Icono nombre="menu" className="text-3xl" />
        </button>
      </header>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-negro/60" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] overflow-y-auto">{lateral}</div>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  );
}
