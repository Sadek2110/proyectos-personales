# Course Watcher + Life OS

Servicio autónomo de vigilancia e ingesta académica (**Course Watcher**) integrado con **Life OS** para mantener sincronizado el temario, entregas, pruebas, anuncios, calificaciones y copias en Google Drive de dos cursos de especialización:

1. **Curso de Especialización en Desarrollo de Aplicaciones en Lenguaje Python**:
   - **Moodle Centros Málaga (Junta de Andalucía)**: `est` (Estructuras de control), `poo` (Programación orientada a objetos), `ana` (Análisis de datos).
   - **Google Classroom (`@g.educaand.es`)**: `ent` (Entornos y Sintaxis en Python).
2. **Curso de Especialización en Ciberseguridad en Entornos de las Tecnologías de la Información**:
   - **Moodle MEFP — Aula Virtual FP Ceuta**: `brs` (Bastionado), `afi` (Análisis forense), `pps` (Puesta en producción segura), `nc` (Normativa), `ic` (Incidentes), `he` (Hacking ético).

---

## Estructura del Repositorio

- [`course-watcher/`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/course-watcher): Demonio ligero en Node.js $\ge 22$ (sin dependencias externas pesadas) con conectores para Moodle Mobile Web Services (SSO CAS y login directo), Google Classroom (Opción B por correos y estructura), sincronización con Google Drive, motor de diff con estado persistente (`/data/watcher-estado.json`), resúmenes automáticos con Gemini (`src/resumen-ia.js`) y servidor de salud (`GET /healthz`, `POST /ejecutar`).
- [`life-os/`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/life-os): Aplicación principal de Life OS con almacén dinámico `/data/temario.json`, endpoints `GET /api/clase/temario`, `POST /api/ingesta/clase` y `POST /api/clase/refrescar`, avisos Web Push de novedades y salud de fuentes, herramientas MCP (`obtenerNovedadesClase`, `obtenerCalificacionesClase`) y vista `Clase.jsx` enriquecida.
- [`docs/`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/docs):
  - [`docs/architecture.md`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/docs/architecture.md): Arquitectura y modelo de datos.
  - [`docs/roadmap.md`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/docs/roadmap.md): Hoja de ruta completa (Fases 0 a 8 al 100%).
  - [`docs/CHANGELOG.md`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/docs/CHANGELOG.md): Registro detallado de cambios por fase.
  - [`docs/specs/`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/docs/specs): Especificaciones SDD de `fase-0.md` a `fase-8.md`.

---

## Ejecución de Tests

```bash
# Suite de aceptación de Course Watcher (33/33 tests)
npm --prefix course-watcher test

# Suite de aceptación de Life OS (78/78 tests)
npm --prefix life-os test

# Compilación de producción del frontend de Life OS
npm --prefix life-os run build
```
