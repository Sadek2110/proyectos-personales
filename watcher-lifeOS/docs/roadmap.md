# Hoja de Ruta (Roadmap) — Course Watcher + Life OS

> [!NOTE]
> **Estado: Roadmap 100% Completado (Fases 0 a 8 en verde)**. Todas las plataformas, conectores, motor de ingesta, avisos Web Push, observabilidad y extras del Brief están implementados y verificados.

---

## 1. Resultados de la Fase 0 — Descubrimiento Técnico (Completado ✅)

### 1.1. Curso 1 — Especialización en Python (`est`, `poo`, `ana` en Moodle Centros Málaga)
- **URL Base**: `https://educacionadistancia.juntadeandalucia.es/centros/malaga`
- **Autenticación API 100% HTTP (sin Playwright)**:
  - Login SSO CAS en `edea.juntadeandalucia.es/cas/login` + intercambio en `/admin/tool/mobile/launch.php?service=moodle_mobile_app` $\rightarrow$ devuelve `wstoken` de 32 caracteres.
- **Módulos verificados y con fixtures anonimizadas en `course-watcher/test/fixtures/moodle/`**:
  - `2005` (`est`): *Estructuras de control en Python* (7 secciones, 45 módulos, 13 entregas).
  - `2475` (`poo`): *Programación orientada a objetos* (3 secciones, 8 módulos, 2 entregas).
  - `2006` (`ana`): *Análisis de datos en Python* (6 secciones, 5 módulos).

### 1.2. Curso 2 — Especialización en Ciberseguridad (`https://www.mecd.es/aulavirtualfpceuta`)
- **Hallazgo clave**: ¡También es **Moodle** (`Aula Virtual FP Ceuta`) y su endpoint `/login/token.php?service=moodle_mobile_app` funciona directamente con usuario y contraseña, devolviendo un `wstoken` con 438 funciones habilitadas!
- **Módulos verificados y con fixtures anonimizadas en `course-watcher/test/fixtures/ciber/`**:
  - `311` (`brs`): *Bastionado de redes y sistemas (CETI_BRS)* — 5 secciones, 39 módulos, 3 entregas.
  - `177` (`afi`): *Análisis forense informático (CETI_AFI)* — 4 secciones, 32 módulos, 2 entregas.
  - `175` (`pps`): *Puesta en producción segura (CETI_PPS)* — 2 secciones, 14 módulos, 1 entrega.
  - `174` (`nc`): *Normativa de ciberseguridad (CETI_NC)* — 2 secciones, 6 módulos, 1 entrega.
  - `173` (`ic`): *Incidentes de ciberseguridad (CETI_IC)* — 9 secciones, 91 módulos, 7 entregas.
  - `172` (`he`): *Hacking ético (CETI_HE)* — 9 secciones, 62 módulos, 5 entregas.
- **Reutilización total**: El mismo conector `MoodleApiSource` servirá tanto para los 3 módulos de Python en Moodle Centros como para los 6 módulos de Ciberseguridad en Aula Virtual FP Ceuta.

### 1.3. Google Classroom (`ent` — Entornos y Sintaxis en Python) — Opción B Confirmada
- Según tu decisión (`Opción B`), en la **Fase 5** conectaremos mediante **correos de notificación / sesión de Classroom** sin requerir crear un proyecto de Apps Script dentro de la cuenta `@g.educaand.es`.

### 1.4. Descarga Automática de PDFs y Materiales a tu Google Drive (1 TB)
- Según tu decisión (`punto 3`), el watcher podrá descargar los recursos nuevos (`.pdf`, `.ipynb`, `.zip`) desde Moodle usando `fileurl + &token=<wstoken>` y subirlos automáticamente a una estructura ordenada en tu Google Drive (`Cursos / <Curso> / <Módulo> / <Unidad> / archivo.pdf`), guardando el `drive_url` en el `Item` de Life OS para que puedas abrirlos siempre desde tu propio Drive de 1 TB.

---

## 2. Plan de Fases (SDD + TDD + Puertas de Confirmación)

| Fase | Nombre | Repositorio / Alcance | Spec | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Fase 0** | Descubrimiento (Moodle Málaga + Moodle FP Ceuta + Classroom), `AGENTS.md`, skills y fixtures | `watcher-lifeOS/` + `course-watcher/` | `docs/specs/fase-0.md` | ✅ **Completada** (4/4 tests en verde) |
| **Fase 1** | Life OS: El temario como dato (`/data/temario.json` + API + Migración IDs) | `life-os/` (rama `feat/fase-1-temario-api` + PR) | `docs/specs/fase-1.md` | ✅ **Completada** (67/67 tests en verde) |
| **Fase 2** | Watcher: Esqueleto + Conector `MoodleApiSource` (Python Málaga) + Subida a Drive | `course-watcher/` | `docs/specs/fase-2.md` | ✅ **Completada** (10/10 tests en verde + smoke test real superado) |
| **Fase 3** | Motor de Diff, estado persistente y envío a Life OS | `course-watcher/` | `docs/specs/fase-3.md` | ✅ **Completada** (15/15 tests en verde) |
| **Fase 4** | Avisos Web Push de novedad en Life OS (`planificador.js`) | `life-os/` (rama `feat/fase-4-avisos-novedad` + PR) | `docs/specs/fase-4.md` | ✅ **Completada** (72/72 tests en verde) |
| **Fase 5** | Conector Google Classroom — Opción B (`Entornos y Sintaxis`) | `course-watcher/` | `docs/specs/fase-5.md` | ✅ **Completada** (19/19 tests en verde) |
| **Fase 6** | Curso de Ciberseguridad (6 módulos en `mecd.es/aulavirtualfpceuta` con `MoodleApiSource`) | `course-watcher/` + `life-os/` | `docs/specs/fase-6.md` | ✅ **Completada** (22/22 tests en verde + smoke test real superado) |
| **Fase 7** | Despliegue en EasyPanel, Cron, Salud de fuentes y UI «Última actualización» | `course-watcher/` + `life-os/` | `docs/specs/fase-7.md` | ✅ **Completada** (26/26 y 72/72 tests en verde) |
| **Fase 8** | Extras (Pestaña Novedades, Calificaciones, Botón Forzar actualización, Modo Simulacro, Herramientas MCP, Resúmenes IA) | `course-watcher/` + `life-os/` | `docs/specs/fase-8.md` | ✅ **Completada** (33/33 y 78/78 tests en verde) |
