# Registro de Cambios (CHANGELOG)

## [Fase 8] — 2026-11-15 — Extras (Sección 8 del Brief: Novedades 7 días, Calificaciones, Refresco Manual, Herramientas MCP y Resúmenes IA)

### Añadido
- **`course-watcher/src/resumen-ia.js` y `src/orquestador.js`** (`esMaterialResumible`, `crearResumidorTemas`):
  - Generación automática de resúmenes en Markdown con Gemini (`gemini-3.8-flash` con fallback automático a `gemini-3.5-flash-lite` ante HTTP `429`/`503`) para temas/materiales nuevos (`PDF`, `Notebook`, `Vídeo`, `Enlace`), respetando el tope `maxPorPasada` e integrándose opcionalmente en `ejecutarPasadaFuente`.
- **`life-os/src/clase.mjs` y `life-os/agente/temario.js`**:
  - `calcularMediaModulo(modulo)`: cálculo de nota media sobre base 10 soportando calificaciones normalizadas (`nota`/`max`) y de Moodle (`graderaw`/`grademax`).
  - `novedadesRecientes(novedades, dias = 7, ahora)` y `novedadesNoVistas(novedades, vistaHasta)`: filtrado de novedades de los últimos 7 días y detección de novedades no vistas para alimentar insignias numéricas.
  - Persistencia de `resumen_ia` y `apunte_url` en los ítems ingestados en `/data/temario.json`.
- **`life-os/agente/herramientas.js`** (Agente Gemini y Servidor MCP):
  - `obtenerNovedadesClase({ dias, modulo })`: responde a «¿qué ha subido el profesor esta semana?».
  - `obtenerCalificacionesClase({ modulo })`: devuelve calificaciones publicadas, nota media sobre 10 y entregas/pruebas pendientes por módulo.
- **`life-os/server.js`, `life-os/src/datos.js`, `life-os/src/App.jsx` y `life-os/src/vistas/Clase.jsx`**:
  - Endpoint autenticado `POST /api/clase/refrescar` que dispara `POST ${WATCHER_URL}/ejecutar` y devuelve el temario actualizado. Disparo inmediato de revisión de planificador en `POST /api/ingesta/clase`.
  - Pestañas/sub-vistas en `Clase`: `[📖 Temario] [🔔 Novedades] [📅 Próximas fechas]`.
  - Insignia numérica (badge) en el icono de `Clase` en la barra de navegación de Life OS cuando hay novedades sin revisar.
  - Vista dedicada de «Novedades»: tarjeta de última revisión y salud de fuentes, tarjetas detalladas de novedades con enlaces, resúmenes IA, salto al temario y feedback enriquecido en «Actualizar ahora».
- **Tests de aceptación (`course-watcher/test/extras.test.js` y `life-os/test/extras-clase.test.js`)**:
  - **33/33 tests en verde** en `course-watcher` y **80/80 tests en verde** en `life-os` + build de producción Vite validado.

## [Fase 7] — 2026-11-15 — Despliegue, Cron, Salud de Fuentes y Observabilidad

### Añadido
- **`course-watcher/src/cron.js`** (`enVentanaCron`, `crearDemonioWatcher`):
  - Planificador periódico cada `CRON_INTERVALO_MIN` (120 min) en la franja `CRON_HORARIO` (`08:00-22:00` en `Europe/Madrid`), con opción `{ forzar: true }` para saltar la ventana horaria a petición del usuario.
  - Ejecución secuencial de todas las fuentes (`moodle`, `ciber`, `classroom`) y reporte de latido (`estadoFuente: { ok, error, fallosSeguidos }`) a Life OS incluso cuando no hay cambios de ítems o cuando una fuente falla.
- **`course-watcher/src/servidor.js`** (`crearServidorWatcher`):
  - Servidor HTTP ligero (`node:http`) con `GET /healthz` (`200 OK` con estado de salud de cada fuente) y `POST /ejecutar` autenticado con `Authorization: Bearer <INGESTA_TOKEN>` (`crypto.timingSafeEqual`).
- **`life-os/agente/temario.js`, `life-os/agente/planificador.js` y `life-os/src/vistas/Clase.jsx`**:
  - Alerta Web Push automática `⚠️ Fuente con fallos: <origen>` (`clave: err:fuente:<origen>:<hoy>`) tras acumular 2 fallos seguidos (`fallosSeguidos >= 2`), respetando el horario de silencio (`23:00-07:30`).
  - Visualización de «Última actualización» y avisos de fallos de fuente en `Clase.jsx`.
- **Tests de aceptación (`course-watcher/test/observabilidad.test.js`)**:
  - 4 tests cubriendo `CA-7.1` a `CA-7.4`. Suite de `course-watcher`: **26/26 tests en verde** y `life-os`: **72/72 tests en verde**.

## [Fase 6] — 2026-11-15 — Curso 2: Especialización en Ciberseguridad (Aula Virtual FP Ceuta)

### Añadido
- **`course-watcher/src/fuentes/moodle.js` y `src/normalizador.js`**:
  - Catálogos `CURSOS_PYTHON_MOODLE` (3 módulos) y `CURSOS_CIBER_MOODLE` (6 módulos: `brs` 311, `afi` 177, `pps` 175, `nc` 174, `ic` 173, `he` 172).
  - Conector `crearFuenteCiberseguridad` con autenticación directa (`POST /login/token.php?service=moodle_mobile_app`), `nombreFuente: 'ciber'` y normalización de secciones específicas de Ceuta (`General`, `Inicio`, `T1`..`T10`, `UT1`..`UT5`, `UD1`..`UD7`, `Exámenes`), filtrando todas las etiquetas `label`.
- **`life-os/src/clase.mjs` y `life-os/agente/temario.js`**:
  - Catálogo `MODULOS_CIBER` e incorporación dinámica de los 6 módulos de Ciberseguridad en `/data/temario.json` manteniendo aislamiento estricto entre orígenes (`moodle`, `classroom`, `ciber`) al archivar y preservando campos manuales.
- **Tests de aceptación y Smoke Test Real (`course-watcher/test/ciber.test.js` y `scripts/smoke-fase-6.js`)**:
  - **22/22 tests en verde** en `course-watcher` y **72/72 tests en verde** en `life-os`.
  - Smoke test real contra `mecd.es/aulavirtualfpceuta` superado: 6 módulos, 171 ítems reales y 19 entregas extraídas y normalizadas, con token `ciberToken` persistido en `.data/watcher-estado.json`.

## [Fase 5] — 2026-11-15 — Conector Google Classroom (`ClassroomSource` — Opción B y Estructura)

### Añadido
- **`course-watcher/src/fuentes/classroom.js`**:
  - `parsearCorreoClassroom(correo, opciones)` (**Opción B**): extracción determinista de entregas (`Nueva tarea`), pruebas (`Nueva pregunta`/`Nuevo cuestionario`), materiales (`Nuevo material` con clasificación `.ipynb` $\rightarrow$ `Notebook`, `.pdf` $\rightarrow$ `PDF`, `.zip` $\rightarrow$ `ZIP`, vídeos $\rightarrow$ `Vídeo` y extracción de `drive_url`), anuncios (`Nuevo anuncio`) y calificaciones (`Con calificación: ...` $\rightarrow$ nota numérica), parseando fechas en español (`25 nov 2026 23:59` $\rightarrow$ `2026-11-25T23:59`), unidades (`Inicio`, `U1`..`U4`) y `ext_id` desde los enlaces de Classroom.
  - `normalizarEstructuraClassroom(datos, opciones)`: normalización de `topics`, `courseWork` (conversión de `dueDate` + `dueTime` UTC a `Europe/Madrid`), `courseWorkMaterials` (con enlaces de Google Drive) y `announcements`.
  - `crearFuenteClassroom`: generación de lotes incrementales (`completa: false`) en modo correos para no archivar nunca el temario existente, o lotes completos (`completa: true`) en modo estructura.
- **Fixtures y Tests de aceptación (`course-watcher/test/classroom.test.js`)**:
  - Fixture de correos `course-watcher/test/fixtures/classroom/correos_sample.json` y 4 tests de aceptación (`CA-5.1` a `CA-5.4`). Suite de `course-watcher`: **19/19 tests en verde**.

## [Fase 4] — 2026-11-15 — Avisos Web Push de Novedad en Life OS

### Añadido
- **`life-os/agente/temario.js`** (`ingestar`):
  - Soporte dual en `ingestar(lote)`: acepta tanto `lote.items` (array plano) como `lote.modulos` (estructura jerárquica con `unidades` y `calificaciones` enviada por `course-watcher`).
  - Registro estructurado de eventos en `estado.novedades` incluyendo `moduloCorto`, detección de `evento: 'cambio_fecha'` (con `fechaAnterior` y `fechaItem`) y detección de `evento: 'nota'` (tanto por ítem como por `modulos[].calificaciones`).
- **`life-os/agente/planificador.js`** (`evaluar` y `crearPlanificador`):
  - Evaluación de avisos de novedad (`tipo: 'novedad'`, `tab: 'clase'`): entregas y pruebas nuevas (`📌 Nueva entrega/prueba: ...`), cambios de fecha (`⚠️ Cambio de fecha: ...`), anuncios del profesor (`📢 Anuncio en ...`), notas publicadas (`🎓 Nota publicada en ...`) y agrupación por módulo de materiales/temas/vídeos (`N novedades en <Módulo>`).
  - Respeto estricto del horario de silencio (`23:00-07:30`): las novedades nocturnas se retienen y agrupan para la mañana, marcando tanto la clave de grupo (`nov:grp:...`) como las individuales (`nov:mat:...`) en `estado.enviados` para evitar repeticiones.
- **Tests de aceptación (`life-os/test/novedades.test.js`)**:
  - 5 nuevos tests cubriendo `CA-4.1` a `CA-4.5`. Suite completa de `life-os`: **72/72 tests en verde** y build de producción Vite validado.

## [Fase 3] — 2026-11-15 — Motor de Diff, Estado Persistente y Envío a Life OS

### Añadido
- **`course-watcher/src/diff.js`**:
  - `calcularDiffLote(estadoFuentePrevio, loteActual)`: detección de ítems `nuevos`, `cambiados` (con indicadores `cambioFecha: true` y `fechaAnterior`), `archivados` (cuando `completa: true`, acotado a los módulos presentes en el lote) y `notasNuevas` (`graderaw` nuevo o modificado).
  - `crearAlmacenEstadoWatcher({ archivo, ahora })`: persistencia atómica (`tmp` + `fs.renameSync`) en `/data/watcher-estado.json`, gestionando instantáneas por fuente (`itemsPorExtId`, `notasPorExtId`), contadores de salud (`fallosSeguidos`, `debeAlertar: fallosSeguidos >= 2`, `ultimaPasadaOk`, `ultimoError`), tokens y caché de Drive.
- **`course-watcher/src/cliente-lifeos.js`** (`crearClienteLifeOs`):
  - Cliente HTTP hacia `POST /api/ingesta/clase` autenticado con `Authorization: Bearer <INGESTA_TOKEN>` y soporte nativo de modo simulacro (`simulacro: true`).
- **`course-watcher/src/orquestador.js`** (`ejecutarPasadaFuente`):
  - Coordinación transaccional: solo consolida el nuevo estado en `almacenEstado` tras confirmar que `enviarLote` tuvo éxito; en segunda pasada idempotente evita peticiones innecesarias (`enviado: false`).
- **Tests de aceptación (`course-watcher/test/diff.test.js`)**:
  - 5 tests de aceptación (`CA-3.1` a `CA-3.5`), incluyendo test End-to-End contra `crearAlmacenTemario` de `life-os`. Suite de `course-watcher`: **15/15 tests en verde**.

## [Fase 2] — 2026-11-15 — Esqueleto de Course Watcher, `MoodleApiSource` y Sincronización con Google Drive

### Añadido
- **`course-watcher/src/normalizador.js`**:
  - `formatearFechaMadrid`: conversión de timestamps Unix a hora local `Europe/Madrid` (`yyyy-MM-ddTHH:mm`) respetando horario de invierno (CET) y verano (CEST).
  - `calcularHashItem`: huella SHA-256 (16 hex) sobre `{ n, tipo, fecha, url }`.
  - `inferirUnidadMoodle` e `inferirTipoMoodle`: mapeo de secciones de Moodle (`General`, `Inicio`, `UD1`..`UD5`, `T1`, `Vídeos`, `UT1`..) y clasificación de módulos (`PDF`, `Notebook`, `Entrega`, `Prueba`, `Enlace`, `Vídeo`, `ZIP`, `Datos`, `Anuncio`, `Tema`), omitiendo etiquetas visuales (`label`).
  - `normalizarCursoMoodle`: cruce de fechas de `mod_assign_get_assignments`, `mod_quiz_get_quizzes_by_courses` y `cm.dates`, extracción de calificaciones (`gradereport_user_get_grade_items`) y limpieza de cualquier token en URLs.
- **`course-watcher/src/fuentes/moodle.js`** (`crearFuenteMoodle`):
  - Soporte dual de autenticación: `modoAuth: 'cas'` (SSO CAS Junta de Andalucía + `launch.php`) y `modoAuth: 'directo'` (`POST /login/token.php?service=moodle_mobile_app` para Ciberseguridad).
  - Reutilización del `wstoken` persistido y renovación automática única ante `invalidtoken`.
  - Protección anti-CAPTCHA/2FA (`ErrorCaptchaDetectado` ante `g-recaptcha`, `cf-turnstile`, `hcaptcha` o `2fa`, deteniendo inmediatamente sin reintentar).
- **`course-watcher/src/drive.js`** (`crearSincronizadorDrive`):
  - Descarga y subida idempotente de archivos adjuntos (`.pdf`, `.ipynb`, `.zip`, `.txt`, `.json`, `.csv`) a Google Drive sin exponer jamás el `wstoken` en los ítems resultantes.
- **Infraestructura y Tests (`course-watcher/`)**:
  - `Dockerfile` (`node:22-alpine`), `.github/workflows/ci.yml` (`node --test`), `test/moodle.test.js` (**10/10 tests en verde** en `course-watcher`) y smoke test real (`scripts/smoke-fase-2.js`) verificado contra Moodle Centros Málaga (58 ítems y 5 calificaciones extraídas en `est`, `poo` y `ana`, con `wstoken` persistido en `.data/watcher-estado.json`).

## [Fase 1] — 2026-11-15 — Life OS: El Temario como Dato

### Añadido
- **`life-os/agente/temario.js`** (`crearAlmacenTemario`):
  - Almacenamiento persistente y atómico en `/data/temario.json` usando `CLASE` de `src/clase.mjs` como semilla inicial.
  - Motor de ingesta (`ingestar(lote)`) con *upsert* por `ext_id`, emparejamiento automático de items de semilla (`id_antiguo` $\rightarrow$ `ext_id` en `mapaIds`), preservación estricta de campos manuales (`nota`, `alerta`, `ahora`, `color`, `meta`, `corto`), archivado sin borrado (`archivado: true` con `completa: true`) e idempotencia total.
- **Endpoints en `life-os/server.js`**:
  - `GET /api/clase/temario`: devuelve el temario actual a usuarios con sesión activa.
  - `POST /api/ingesta/clase`: endpoint máquina-a-máquina protegido mediante `Authorization: Bearer <INGESTA_TOKEN>` comparado con `crypto.timingSafeEqual` (`igual()`).
- **Migración sin pérdida en `life-os/src/clase.mjs`, `src/datos.js` y `src/vistas/Clase.jsx`**:
  - `hechoItem(ctx, m, u, it)` reconoce progreso guardado tanto con el ID clásico (`modulo/unidad/nombre`) como con `ext_id` o `id_antiguo` tras un renombrado del profesor.
  - La vista React `Clase.jsx` consume el temario dinámico desde `/api/clase/temario` con fallback inmediato a `CLASE`.
- **Tests de aceptación (`life-os/test/temario.test.js`)**:
  - 6 nuevos tests cubriendo `CA-1.1` a `CA-1.6`. Suite completa de `life-os`: **67/67 tests en verde**.

## [Fase 0] — 2026-11-15 — Descubrimiento y Preparación del Entorno Local

### Añadido
- **`AGENTS.md`** en la raíz del workspace, en `life-os/AGENTS.md` y en `course-watcher/AGENTS.md` con todas las reglas de SDD, TDD, preservación de campos manuales, seguridad de credenciales y orquestación multi-agente.
- **Skills especializadas del workspace (`.agents/skills/`)**:
  - `sdd-tdd-workflow`: protocolo paso a paso para especificaciones, tests de aceptación y puertas de validación por fase.
  - `moodle-connector`: documentación del flujo real de autenticación SSO CAS $\rightarrow$ `launch.php` $\rightarrow$ `wstoken` de Moodle Centros y mapeo de funciones WS.
  - `lifeos-temario-ingesta`: especificación técnica de `/data/temario.json`, preservación de campos manuales y migración de IDs (`modulo/unidad/nombre` $\leftrightarrow$ `ext_id`).
  - `multi-agent-orchestrator`: plantillas de `run_workflow` y `swarm` para paralelizar tareas sin colisiones.
- **Repositorio local `life-os/`**: clonado desde `Sadek2110/life-os`, dependencias instaladas y suite de 61 tests verificada al 100% en verde (`node --test`).
- **Estructura base de `course-watcher/`**:
  - `scripts/descubrimiento-moodle.js`: script que resuelve el login SSO CAS de la Junta de Andalucía con `fetch` nativo, obtiene el token móvil (`moodle_mobile_app`) y descarga fixtures anonimizadas.
  - `test/fixtures/moodle/`: fixtures reales y anonimizadas de los cursos `2005` (Estructuras), `2475` (POO) y `2006` (Análisis de datos), incluyendo contenidos, entregas (`mod_assign`) y calificaciones (`gradereport_user`).
  - `test/fixtures/classroom/classroom_sample.json`: fixture de referencia para el módulo de Entornos en Google Classroom.
  - `test/fixtures.test.js`: 3 tests en verde que validan la integridad y anonimización de las fixtures.
- **Documentación y Especificaciones (`docs/`)**:
  - `docs/architecture.md`, `docs/roadmap.md`, `docs/specs/fase-0.md` y `docs/specs/fase-1.md`.
