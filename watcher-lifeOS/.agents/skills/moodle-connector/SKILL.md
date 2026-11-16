---
name: moodle-connector
description: >-
  Guía técnica para conectar con Moodle Centros (Junta de Andalucía) mediante su
  Web Service API móvil (moodle_mobile_app), normalizar módulos, secciones,
  recursos, tareas y calificaciones al modelo Item de Course Watcher, y generar
  fixtures anonimizadas. Úsala en la Fase 0, Fase 2 y Fase 6.
---

# Conector API de Moodle (`MoodleApiSource`)

`MoodleApiSource` soporta las dos instancias de Moodle del proyecto:

1. **Curso 1 — Especialización en Python (Moodle Centros Junta de Andalucía)**:
   - URL base: `https://educacionadistancia.juntadeandalucia.es/centros/malaga`
   - Obtención de token: Flujo SSO CAS (`edea.juntadeandalucia.es/cas/login`) $\rightarrow$ `/admin/tool/mobile/launch.php?service=moodle_mobile_app`.
   - IDs de curso:
     - `2005` $\rightarrow$ `est` (Estructuras de control en Python)
     - `2475` $\rightarrow$ `poo` (Programación orientada a objetos)
     - `2006` $\rightarrow$ `ana` (Análisis de datos en Python)

2. **Curso 2 — Especialización en Ciberseguridad (Aula Virtual FP Ceuta — MEFP)**:
   - URL base: `https://www.mecd.es/aulavirtualfpceuta`
   - Obtención de token: Directa vía `POST /login/token.php` (`service=moodle_mobile_app`).
   - IDs de curso:
     - `311` $\rightarrow$ `brs` (Bastionado de redes y sistemas)
     - `177` $\rightarrow$ `afi` (Análisis forense informático)
     - `175` $\rightarrow$ `pps` (Puesta en producción segura)
     - `174` $\rightarrow$ `nc` (Normativa de ciberseguridad)
     - `173` $\rightarrow$ `ic` (Incidentes de ciberseguridad)
     - `172` $\rightarrow$ `he` (Hacking ético)

3. **Descarga y Sincronización de Archivos (PDFs / Notebooks) a Google Drive**:
   - Los archivos en `contents[].fileurl` de Moodle se descargan añadiendo `?token=<wstoken>` (o `&token=<wstoken>`) y se suben a la carpeta del curso en Google Drive (1 TB), guardando el enlace de Drive (`drive_url`) en el `Item`.

## 1. Obtención y Reutilización del Token (`wstoken`)

En Moodle Centros (Junta de Andalucía), `typeoflogin === 3` (SSO CAS en `edea.juntadeandalucia.es`), por lo que `/login/token.php` directo devuelve `invalidlogin`.
- **Flujo validado de obtención de token (100% HTTP con `fetch` + cookies, sin Playwright)**:
  1. `GET https://educacionadistancia.juntadeandalucia.es/centros/malaga/login/index.php?authCAS=CAS` (siguiendo redirecciones a `edea.juntadeandalucia.es/cas/login` y extrayendo el campo oculto `execution`).
  2. `POST https://edea.juntadeandalucia.es/cas/login?service=...` con `username`, `password`, `execution`, `_eventId=submit`.
  3. Una vez autenticado en Moodle Centros, llamar a:
     `GET /centros/malaga/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<random>&urlscheme=moodlemobile`
  4. Capturar la cabecera `Location: moodlemobile://token=<base64>`, decodificar el Base64 (`<passport_md5>:::<wstoken>:::<privatetoken>`) y extraer el `wstoken` (32 caracteres hex).
- **Regla de oro**: El `wstoken` devuelto es de larga duración. Debe guardarse en `/data/watcher-estado.json` (o pasarse por `MOODLE_TOKEN`) y reutilizarse en todas las pasadas. Solo se solicita un token nuevo vía CAS si la API devuelve `invalidtoken`.
- Si la respuesta de CAS incluye bloqueo o captcha, abortar inmediatamente y notificar sin reintentar.

## 2. Funciones de Web Service (`webservice/rest/server.php`)

Todas las llamadas van a `POST /webservice/rest/server.php` con `wstoken=<token>&moodlewsrestformat=json&wsfunction=<fn>`:

1. **`core_webservice_get_site_info`**:
   - Devuelve `userid`, `fullname` (anonimizar en fixtures) y la lista `functions` habilitadas para ese token.
2. **`core_course_get_contents`** (`courseid=2005|2475|2006`):
   - Devuelve las secciones (`sections[]`: `id`, `section`, `name`, `summary`, `modules[]`).
   - Cada módulo (`cm`) tiene: `id` (`cmid`), `name`, `modname` (`resource`, `url`, `assign`, `quiz`, `forum`, `folder`, `page`), `url`, `dates[]`, `contents[]` (`fileurl`, `filename`, `mimetype`, `timemodified`).
3. **`mod_assign_get_assignments`** (`courseids[0]=2005&courseids[1]=2475&courseids[2]=2006`):
   - Devuelve las tareas (`courses[].assignments[]`) con `id`, `cmid`, `name`, `duedate` (timestamp Unix en segundos, `0` si no tiene fecha), `allowsubmissionsfromdate`, ` cutoffdate`, `intro`.
4. **`mod_quiz_get_quizzes_by_courses`** (si está habilitada):
   - Devuelve cuestionarios/pruebas con `id`, `coursemodule` (`cmid`), `name`, `timeopen`, `timeclose`.
5. **`core_course_get_updates_since`** (`courseid`, `since`):
   - Permite comprobar rápidamente si hubo cambios desde la última pasada antes de descargar todo.
6. **`gradereport_user_get_grade_items`** (`courseid`, `userid`):
   - Devuelve las calificaciones publicadas (`usergrades[0].gradeitems[]`: `cmid`, `itemname`, `graderaw`, `grademax`, `gradeformatted`, `feedback`).

## 3. Reglas de Normalización a `Item`

Cada elemento de Moodle se transforma al contrato `Item`:

- **`ext_id`**: `moodle:<courseid>:cm:<cmid>` (ej. `moodle:2005:cm:48213`). Para notas: `moodle:<courseid>:grade:<id>`.
- **`origen`**: `'moodle'`
- **`modulo`**: `'est'` (`2005`), `'poo'` (`2475`), `'ana'` (`2006`)
- **`unidad`**: Se infiere del nombre de la sección de Moodle (`section.name`) mapeado al código de unidad (`Inicio`, `UD1`..`UD5`, `T1`, `General`, etc.).
- **`tipo`**:
  - `modname === 'assign'` $\rightarrow$ `'Entrega'`
  - `modname === 'quiz'` $\rightarrow$ `'Prueba'`
  - `modname === 'forum'` (avisos) $\rightarrow$ `'Anuncio'`
  - `modname === 'url'` $\rightarrow$ si apunta a vídeo/Drive `'Vídeo'`, si no `'Enlace'`
  - `modname === 'resource'`:
    - `.ipynb` $\rightarrow$ `'Notebook'`
    - `.pdf` $\rightarrow$ `'PDF'`
    - `.zip` / `.rar` $\rightarrow$ `'ZIP'`
    - `.txt` / `.json` / `.csv` $\rightarrow$ `'Datos'`
    - por defecto $\rightarrow$ `'Tema'`
- **`fecha`**: Convertir timestamp Unix (segundos) a hora local `Europe/Madrid` en formato `yyyy-MM-ddTHH:mm` (usando `Intl.DateTimeFormat`, respetando horario de verano/invierno). Si `duedate === 0`, omitir o `''`.
- **`hash`**: SHA-256 (primeros 16 hex) de `JSON.stringify({ n, tipo, fecha, url })` para detectar cambios reales.
