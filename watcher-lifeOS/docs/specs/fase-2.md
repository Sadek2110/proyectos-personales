# Especificación Fase 2 — Esqueleto de Course Watcher, `MoodleApiSource` y Sincronización con Google Drive

## 1. Objetivo y Alcance
Construir el núcleo del paquete `course-watcher/` y el conector completo `MoodleApiSource` para los 3 módulos de Moodle Centros de la **Especialización en Python** (`2005` $\rightarrow$ `est`, `2475` $\rightarrow$ `poo`, `2006` $\rightarrow$ `ana`), preparado también para el modo de login directo de **Ciberseguridad** (`Fase 6`), junto con el sincronizador de archivos adjuntos (`.pdf`, `.ipynb`, `.zip`, `.txt`, `.json`, `.csv`) hacia Google Drive (1 TB).

---

## 2. Componentes y Contratos

### 2.1. Normalizador (`course-watcher/src/normalizador.js`)
Módulo puro sin efectos secundarios de red que transforma las estructuras crudas de Moodle al contrato de `life-os`:

1. **`formatearFechaMadrid(timestampSegundos)`**:
   - Si `!timestampSegundos` o `timestampSegundos <= 0`, devuelve `undefined`.
   - Convierte un timestamp Unix (en segundos) a `yyyy-MM-ddTHH:mm` en zona horaria `Europe/Madrid` (respetando horario de invierno CET UTC+1 y verano CEST UTC+2 mediante `Intl.DateTimeFormat`).
2. **`calcularHashItem({ n, tipo, fecha, url })`**:
   - Devuelve los primeros 16 caracteres hexadecimales del SHA-256 de `JSON.stringify({ n: n || '', tipo: tipo || '', fecha: fecha || '', url: url || '' })`.
3. **`inferirUnidadMoodle(idModulo, seccion)`**:
   - Mapea `seccion.name` y `seccion.section` al par `{ k, t }`:
     - Si `seccion.name` es `"General"` $\rightarrow$ `{ k: 'General', t: 'General' }` (o `'Repositorio'` en `poo` si aplica, manteniendo compatibilidad con las claves `k` de `src/clase.mjs`).
     - Si `seccion.name` empieza por `"Inicio de curso"` $\rightarrow$ `{ k: 'Inicio', t: 'Inicio de curso' }`.
     - En `est` (`2005`):
       - Sección 2 (`"Introducción a las estructuras de control..."`) $\rightarrow$ `k: 'UD1'`
       - Sección 3 (`"Sentencias condicionales"`) $\rightarrow$ `k: 'UD2'`
       - Sección 4 (`"Sentencias iterativas"`) $\rightarrow$ `k: 'UD3'`
       - Sección 5 (`"Funciones"`) $\rightarrow$ `k: 'UD4'`
       - Sección 6 (`"Programación de código eficiente y robusto"`) $\rightarrow$ `k: 'UD5'`
     - En `poo` (`2475`):
       - `"Tema 1..."` $\rightarrow$ `k: 'T1'`
       - `"Clases grabadas"` $\rightarrow$ `k: 'Vídeos'`
     - En `ana` (`2006`):
       - `"Acceso a datos"` $\rightarrow$ `k: 'UD1'`
       - `"Manipulación, limpieza..."` $\rightarrow$ `k: 'UD2'`
       - `"Análisis exploratorio..."` $\rightarrow$ `k: 'UD3'`
       - `"Modelado estadístico..."` $\rightarrow$ `k: 'UD4'`
     - Regla general para nuevas secciones o cursos (ej. Ciberseguridad):
       - `"UT01.- ..."` / `"UT1 ..."` $\rightarrow$ `k: 'UT1'`
       - `"TEMA 1.- ..."` / `"Tema 1..."` $\rightarrow$ `k: 'T1'`
       - `"1. Desarrollo..."` $\rightarrow$ `k: 'UD1'`
       - Fallback: `k: 'S' + seccion.section`, `t: seccion.name`.
4. **`inferirTipoMoodle(cm)`**:
   - Ignora `cm.modname === 'label'` (devuelve `null` para que no se incluya como ítem).
   - `assign` $\rightarrow$ `'Entrega'`
   - `quiz` o `questionnaire` $\rightarrow$ `'Prueba'`
   - `forum`: si el nombre incluye `aviso` o `notificacion` (insensible a mayúsculas/acentos) $\rightarrow$ `'Anuncio'`, si no $\rightarrow$ `'Foro'` (o se omite si solo se quieren avisos/materiales; incluimos foros de avisos como `'Anuncio'` y foros de unidad como `'Enlace'`).
   - `folder` $\rightarrow$ si contiene un `.zip` en `contents[]` $\rightarrow$ `'ZIP'`, si contiene `.pdf` $\rightarrow$ `'PDF'`, por defecto `'Tema'`.
   - `url` $\rightarrow$ si `contents[0]?.fileurl` o `cm.name` apunta a vídeo (`drive.google.com/file`, `youtube`, `vimeo`, o sección `Vídeos` / `Clases grabadas` / `Videollamada`) $\rightarrow$ `'Vídeo'`, si no $\rightarrow$ `'Enlace'`.
   - `resource` / `page` / `book`:
     - Según extensión de `contents[0]?.filename` o `mimetype`:
       - `.ipynb` $\rightarrow$ `'Notebook'`
       - `.pdf` o `application/pdf` $\rightarrow$ `'PDF'`
       - `.zip` / `.rar` / `.7z` $\rightarrow$ `'ZIP'`
       - `.txt` / `.json` / `.csv` / `.xml` $\rightarrow$ `'Datos'`
       - por defecto $\rightarrow$ `'Tema'`
5. **`normalizarCursoMoodle({ courseId, idModulo, nombreModulo, secciones, assignments, quizzes, grades })`**:
   - Devuelve `{ id: idModulo, nombre: nombreModulo, unidades: [...], calificaciones: [...] }`.
   - Cada ítem generado incluye:
     - `ext_id`: `moodle:${courseId}:cm:${cm.id}`
     - `origen`: `'moodle'`
     - `n`: `cm.name.trim()`
     - `tipo`: tipo inferido
     - `fecha`: para `'Entrega'`, usa `assignment.duedate` (de `mod_assign_get_assignments` cruzando por `cmid === cm.id`) o el timestamp de `cm.dates` con `dataid === 'duedate'`; para `'Prueba'`, usa `quiz.timeclose || quiz.timeopen` o `cm.dates` (`timeclose` / `timeopen`). Formateado con `formatearFechaMadrid`.
     - `url`: para `url` externa usa `cm.contents?.[0]?.fileurl || cm.url`; para el resto usa `cm.url`.
     - `archivos`: lista de `{ filename, fileurl, filesize, mimetype, timemodified }` extraída de `cm.contents` (cuando `type === 'file'`) para que el sincronizador de Google Drive pueda descargarlos sin exponer el `wstoken` en el `temario.json`.
     - `hash`: calculado con `calcularHashItem`.

---

### 2.2. Conector `MoodleApiSource` (`course-watcher/src/fuentes/moodle.js`)
Fábrica `crearFuenteMoodle(opciones)`:
- **Opciones**:
  - `baseUrl`: URL base del Moodle (ej. `https://educacionadistancia.juntadeandalucia.es/centros/malaga`).
  - `modoAuth`: `'cas'` (por defecto para Junta de Andalucía) o `'directo'` (`POST /login/token.php`).
  - `user`, `pass`, `tokenInicial`: credenciales o token preexistente.
  - `cursos`: array de `{ id, codigo, nombre }`.
  - `fetchFn`: función `fetch` inyectable para tests sin red.
  - `guardarToken` / `leerToken`: callbacks opcionales para persistir y reutilizar el `wstoken`.
- **Comportamiento**:
  1. Reutiliza siempre el `wstoken` en memoria o devuelto por `leerToken()`.
  2. Si no hay token, lo obtiene vía `obtenerTokenCas()` (`modoAuth === 'cas'`) o `obtenerTokenDirecto()` (`modoAuth === 'directo'`), y lo persiste con `guardarToken(token)`.
  3. Si una llamada a `webservice/rest/server.php` devuelve `{ exception, errorcode: 'invalidtoken' }`, solicita **una sola vez** un token nuevo y reintenta la llamada.
  4. **Seguridad / Anti-CAPTCHA**: Si la página de login devuelve un formulario con `g-recaptcha`, `cf-turnstile`, `hcaptcha` o bloqueo de seguridad, lanza `ErrorCaptchaDetectado` y detiene inmediatamente sin reintentar.
  5. Ejecuta las consultas curso a curso de forma **estrictamente secuencial** (nunca en paralelo contra el mismo servidor Moodle).

---

### 2.3. Sincronizador de Archivos con Google Drive (`course-watcher/src/drive.js`)
Fábrica `crearSincronizadorDrive({ subirArchivo, fetchFn, estadoDrive })`:
- Recorre los ítems normalizados que tengan `archivos[]` descargables (`.pdf`, `.ipynb`, `.zip`, `.txt`, `.json`, `.csv`).
- Calcula una clave única por archivo: `${item.ext_id}:${archivo.filename}:${archivo.timemodified || 0}`.
- Si ya existe en `estadoDrive[clave]`, reutiliza el `drive_url` guardado sin volver a descargar el archivo de Moodle ni subirlo a Drive (**idempotencia de archivos**).
- Si es nuevo o cambió su `timemodified`:
  1. Descarga el binario desde `archivo.fileurl` añadiendo `token=<wstoken>` en la query string (sin guardar jamás el `wstoken` en el objeto `Item` ni en logs).
  2. Invoca `subirArchivo({ curso, modulo: idModulo, unidad: kUnidad, filename, mimetype, buffer })` que devuelve `{ drive_url, file_id }`.
  3. Asigna `item.drive_url = drive_url` y registra la entrada en `estadoDrive[clave]`.

---

## 3. Criterios de Aceptación (TDD)

- **CA-2.1 (Normalización de los 3 módulos de Python desde fixtures)**:
  - Al alimentar `normalizarCursoMoodle` con las fixtures reales anonimizadas (`course_2005_contents.json`, `course_2475_contents.json`, `course_2006_contents.json`, `assignments.json`, `grades_*.json`), genera los 3 módulos (`est`, `poo`, `ana`) con sus unidades (`Inicio`, `UD1`..`UD5`, `General`, `T1`, `Vídeos`), tipos (`PDF`, `Notebook`, `Entrega`, `Prueba`, `Enlace`, `Vídeo`, `ZIP`, `Anuncio`) y `ext_id` con formato `moodle:<courseId>:cm:<cmid>`, ignorando los módulos de tipo `label`.
- **CA-2.2 (Conversión horaria `Europe/Madrid` y cruce de fechas de entrega)**:
  - `formatearFechaMadrid` convierte correctamente timestamps tanto en horario de verano (CEST, UTC+2) como de invierno (CET, UTC+1) al formato `yyyy-MM-ddTHH:mm`.
  - Las tareas (`assign`) toman su fecha límite de `mod_assign_get_assignments` (`duedate > 0`) o de `cm.dates`.
- **CA-2.3 (Reutilización y renovación automática de `wstoken`)**:
  - `crearFuenteMoodle` reutiliza el `wstoken` existente sin llamar a CAS ni a `/login/token.php`.
  - Si el servidor responde `{ errorcode: 'invalidtoken' }`, renueva el token una vez, lo guarda mediante `guardarToken` y completa la petición.
- **CA-2.4 (Detección de CAPTCHA / 2FA sin reintento)**:
  - Si el HTML de CAS/login contiene un reto de CAPTCHA (`g-recaptcha`, `cf-turnstile`, `hcaptcha`), `crearFuenteMoodle` lanza `ErrorCaptchaDetectado` inmediatamente sin reintentar.
- **CA-2.5 (Sincronización idempotente de PDFs y materiales a Google Drive sin filtrar `wstoken`)**:
  - `crearSincronizadorDrive` descarga los archivos nuevos añadiendo `token=<wstoken>` a la petición HTTP, los sube a Drive y añade `drive_url` al ítem.
  - En una segunda pasada con el mismo `timemodified`, no realiza ninguna descarga ni subida (`descargados: 0`), y ningún `Item` resultante contiene el `wstoken` en `url` ni en `drive_url`.
- **CA-2.6 (Soporte dual CAS y Login Directo)**:
  - `crearFuenteMoodle` soporta `modoAuth: 'directo'` (`POST /login/token.php?service=moodle_mobile_app`) y normaliza correctamente una fixture de Ciberseguridad (`course_311_contents.json`).
