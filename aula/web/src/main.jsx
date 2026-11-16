import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LayoutAlumno, LayoutProfesor, Requiere } from './components/layouts.jsx';
import { ProveedorAvisos } from './components/ui.jsx';
import './index.css';
import { ProveedorSesion } from './lib/sesion.jsx';
import { Acceso, Invitacion, Privacidad } from './pages/acceso.jsx';
import { Calendario } from './pages/alumno/calendario.jsx';
import { Cuenta } from './pages/alumno/cuenta.jsx';
import { Ejercicio, Ejercicios } from './pages/alumno/ejercicios.jsx';
import { Inicio } from './pages/alumno/inicio.jsx';
import { Tema, Temario } from './pages/alumno/temario.jsx';
import { Datos } from './pages/admin/datos.jsx';
import { Integraciones } from './pages/admin/integraciones.jsx';
import { Alumnos, FichaAlumno } from './pages/profesor/alumnos.jsx';
import { AvisosCalendario } from './pages/profesor/calendario.jsx';
import { Correccion, Correcciones } from './pages/profesor/correcciones.jsx';
import { Panel } from './pages/profesor/panel.jsx';
import { PasarLista, Sesiones } from './pages/profesor/sesiones.jsx';
import { EditorTemario } from './pages/profesor/temario.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <ProveedorAvisos>
          <Routes>
            <Route path="/acceso" element={<Acceso />} />
            <Route path="/invitacion/:token" element={<Invitacion />} />
            <Route path="/privacidad" element={<Privacidad />} />

            <Route element={<Requiere rol="alumno"><LayoutAlumno /></Requiere>}>
              <Route index element={<Inicio />} />
              <Route path="calendario" element={<Calendario />} />
              <Route path="temario" element={<Temario />} />
              <Route path="temario/:id" element={<Tema />} />
              <Route path="ejercicios" element={<Ejercicios />} />
              <Route path="ejercicios/:id" element={<Ejercicio />} />
              <Route path="cuenta" element={<Cuenta />} />
            </Route>

            <Route path="profesor" element={<Requiere rol="profesor"><LayoutProfesor /></Requiere>}>
              <Route index element={<Panel />} />
              <Route path="sesiones" element={<Sesiones />} />
              <Route path="sesiones/:id" element={<PasarLista />} />
              <Route path="alumnos" element={<Alumnos />} />
              <Route path="alumnos/:alumnoId" element={<FichaAlumno />} />
              <Route path="correcciones" element={<Correcciones />} />
              <Route path="correcciones/:id" element={<Correccion />} />
              <Route path="temario" element={<EditorTemario />} />
              <Route path="temario/ver/:id" element={<Tema vistaProfesor />} />
              <Route path="calendario" element={<AvisosCalendario />} />
              <Route path="cuenta" element={<Cuenta />} />
              <Route path="datos" element={<Requiere rol="admin"><Datos /></Requiere>} />
              <Route path="integraciones" element={<Requiere rol="admin"><Integraciones /></Requiere>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ProveedorAvisos>
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
);
