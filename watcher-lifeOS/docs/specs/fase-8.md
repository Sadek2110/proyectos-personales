# Especificación Técnica — Fase 8: Extras (Sección 8 del Brief)

## 1. Objetivo y Alcance

Esta fase implementa las mejoras de valor añadido descritas en la **Sección 8 («Lo que yo añadiría»)** del *Brief v2 — Course Watcher (revisado)*:

1. **Pestaña / Sub-vista dedicada «Novedades» (últimos 7 días) en la vista Clase (`life-os/src/vistas/Clase.jsx` e insignias en `src/App.jsx`)**:
   - Sub-barra de pestañas `[📖 Temario] [🔔 Novedades] [📅 Próximas fechas]` con persistencia en `localStorage`.
   - Muestra en un único lugar qué ha subido o cambiado cada profesor en los últimos 7 días a partir de `temarioQ.data?.novedades`, tarjeta de estado de salud de fuentes (`Moodle`, `Ceuta`, etc.) y fecha de última revisión.
   - Cálculo de novedades no vistas (`novedadesNoVistas(novedades, vistaHasta)`) que alimenta la insignia numérica (badge) en la pestaña `Clase` del menú principal de Life OS y en el botón `🔔 Novedades`. Al entrar a la pestaña, las novedades se marcan como vistas actualizando `lifeos:novedadesVistasHasta`.
   - Tarjetas enriquecidas para cada novedad con módulos coloreados, enlace directo (`Abrir recurso` / `Ver en Drive`), botón de navegación hacia el temario (`Ver en Temario`) y resumen IA si existe.
   - Estado vacío amigable cuando no hay novedades recientes y feedback detallado tras pulsar `Actualizar ahora`.
2. **Calificaciones y nota media por módulo (`life-os/src/clase.mjs` y `life-os/src/vistas/Clase.jsx`)**:
   - Función pura `calcularMediaModulo(modulo)` en `life-os/src/clase.mjs` que calcula la nota media sobre base 10 de las calificaciones numéricas publicadas en `modulo.calificaciones`.
   - Visualización en la tarjeta de cada módulo en `Clase.jsx` tanto de la nota media como del desglose de calificaciones publicadas (`nombre`, `nota`, `max`, `comentario`).
3. **Botón «Actualizar ahora» (`POST /api/clase/refrescar` en `life-os/server.js` + `refrescarTemario` en `life-os/src/datos.js` + botón en `Clase.jsx`)**:
   - Endpoint `POST /api/clase/refrescar` en `life-os/server.js` (protegido por cookie de sesión válida) que dispara `POST ${WATCHER_URL}/ejecutar` con `Authorization: Bearer ${INGESTA_TOKEN}` y devuelve el resumen de la pasada.
   - Botón «Actualizar ahora» en el pie de `Clase.jsx` que invoca `refrescarTemario()` e invalida la caché de `['temario']`.
4. **Herramientas nuevas para el Agente y Servidor MCP (`life-os/agente/herramientas.js`)**:
   - `obtenerNovedadesClase({ dias = 7, modulo })`: responde a preguntas como *«¿qué ha subido el profesor esta semana?»* filtrando `temario.novedades` por ventana temporal y módulo opcional.
   - `obtenerCalificacionesClase({ modulo })`: responde a preguntas como *«¿qué notas llevo?»* o *«¿qué tengo pendiente de POO?»* devolviendo para cada módulo las calificaciones publicadas, su nota media sobre 10 y las entregas/pruebas pendientes.
5. **Resumen con IA de cada tema nuevo (`course-watcher/src/resumen-ia.js` e integración en `course-watcher/src/orquestador.js`)**:
   - Módulo `crearResumidorTemas({ apiKey, modelo = 'gemini-3.8-flash', modeloReserva = 'gemini-3.5-flash-lite', fetchFn, maxPorPasada = 5 })` que genera un resumen estructurado en Markdown (conceptos clave, definiciones y puntos de examen) para los materiales nuevos (`PDF`, `Notebook`, `Enlace`) detectados en una pasada, respetando la cuota gratuita de Gemini y con fallback automático a `modeloReserva` ante errores `429`/`503`.

---

## 2. Contratos Técnicos

### 2.1. `calcularMediaModulo(modulo)` y `novedadesRecientes(novedades, dias, ahora)` en `life-os/src/clase.mjs`

```js
/**
 * Calcula la nota media sobre 10 de las calificaciones numéricas de un módulo.
 * Ignora calificaciones sin nota numérica válida o con max <= 0.
 * @param {object} modulo - Objeto módulo con array opcional `calificaciones`.
 * @returns {number|null} Media redondeada a 2 decimales sobre 10, o null si no hay notas.
 */
export function calcularMediaModulo(modulo)
```

```js
/**
 * Filtra las novedades detectadas en los últimos `dias` días (por defecto 7).
 * @param {Array} novedades - Lista de novedades de `/data/temario.json`.
 * @param {number} [dias=7] - Ventana en días.
 * @param {Date|string} [ahora=new Date()] - Instante de referencia.
 * @returns {Array} Novedades dentro de la ventana ordenadas de más reciente a más antigua.
 */
export function novedadesRecientes(novedades = [], dias = 7, ahora = new Date())
```

### 2.2. Herramientas del Agente y MCP (`life-os/agente/herramientas.js`)

Se añaden dos herramientas de solo lectura (`confirmar: false`) al catálogo de `crearHerramientas`:

1. **`obtenerNovedadesClase`**:
   - **Descripción**: `'Novedades detectadas por Course Watcher en los módulos de clase (nuevos temas, entregas, cambios de fecha, anuncios o notas publicadas) durante los últimos días.'`
   - **Parámetros**:
     - `dias` (`INTEGER`, opcional, por defecto `7`): Número de días hacia atrás a consultar (1 a 60).
     - `modulo` (`STRING`, opcional): ID (`est`, `poo`, `ana`, `ent`, `brs`, etc.) o nombre corto del módulo para filtrar.
   - **Salida**: `{ dias, total, novedades: [...] }`.
2. **`obtenerCalificacionesClase`**:
   - **Descripción**: `'Calificaciones publicadas, nota media sobre 10 y entregas o pruebas pendientes por módulo de clase.'`
   - **Parámetros**:
     - `modulo` (`STRING`, opcional): ID o nombre corto del módulo para filtrar.
   - **Salida**: `{ modulos: [{ id, corto, nombre, media, calificaciones, pendientes: [{ unidad, nombre, tipo, fecha }] }] }`.

### 2.3. Endpoint `POST /api/clase/refrescar` (`life-os/server.js`)

- **Autenticación**: Requiere cookie de sesión válida (`sesionValida(req)`). Si no hay sesión, devuelve `401 { ok: false, error: 'Sesión caducada' }`.
- **Configuración**: Variable de entorno `WATCHER_URL` (por defecto `http://course-watcher:3050` o `process.env.WATCHER_URL`).
- **Comportamiento**:
  - Si `ENV.watcherUrl` e `ENV.ingestaToken` están configurados, realiza `POST ${ENV.watcherUrl.replace(/\/+$/, '')}/ejecutar` con cabecera `Authorization: Bearer ${ENV.ingestaToken}`.
  - Devuelve `200 { ok: true, data: { disparado: true, watcher: respuestaWatcher, temario: agente.temario() } }`.
  - Si el watcher no está alcanzable, devuelve `424 { ok: false, error: e.message }`.

### 2.4. Resumidor con IA de Temas Nuevos (`course-watcher/src/resumen-ia.js`)

```js
const { crearResumidorTemas, esMaterialResumible } = require('./resumen-ia.js');
```

- `esMaterialResumible(item)`: devuelve `true` si `!item.archivado && ['PDF', 'Notebook', 'Vídeo', 'Enlace'].includes(item.tipo) && !item.resumen_ia`.
- `crearResumidorTemas({ apiKey, modelo = 'gemini-3.8-flash', modeloReserva = 'gemini-3.5-flash-lite', fetchFn = fetch, maxPorPasada = 5 })`:
  - `resumirItem(item, textoFuente = '')`:
    - Si no hay `apiKey`, devuelve `null` sin lanzar error.
    - Llama a `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent` con un prompt en español que sintetiza puntos clave y posibles preguntas de examen en máximo 6 viñetas.
    - Si recibe HTTP `429` o `503` y existe `modeloReserva`, reintenta automáticamente con `modeloReserva`.
  - `enriquecerLoteConResumenes(lote, idsNuevos)`:
    - Para hasta `maxPorPasada` ítems cuyo `ext_id` esté en `idsNuevos` y cumplan `esMaterialResumible(item)`, genera su `resumen_ia` y lo adjunta al ítem antes de enviarlo a Life OS.

---

## 3. Criterios de Aceptación

- **CA-8.1 (`calcularMediaModulo` y `novedadesRecientes`)**:
  - Calcula correctamente la media sobre 10 convirtiendo notas con distinta base (ej. `8` sobre `10` y `4.5` sobre `5` $\rightarrow$ media `8.5`), e ignora calificaciones sin nota numérica.
  - `novedadesRecientes` devuelve únicamente las novedades de los últimos `N` días ordenadas de más reciente a más antigua.
- **CA-8.2 (Herramientas MCP / Agente `obtenerNovedadesClase` y `obtenerCalificacionesClase`)**:
  - Ambas herramientas están registradas en `crearHerramientas`, tienen `confirmar: false` y responden con las novedades filtradas por días/módulo y con las calificaciones + media + pendientes de cada módulo.
- **CA-8.3 (`POST /api/clase/refrescar` y UI en `Clase.jsx`)**:
  - `POST /api/clase/refrescar` exige sesión válida, llama al watcher con `Bearer ${INGESTA_TOKEN}` y retorna el estado actualizado.
  - `Clase.jsx` incluye la sección `Novedades` (últimos 7 días), las calificaciones y media en cada módulo, y el botón `Actualizar ahora` en el pie.
- **CA-8.4 (`crearResumidorTemas` en `course-watcher`)**:
  - Genera resúmenes con Gemini para temas nuevos (`PDF`/`Notebook`), hace fallback al `modeloReserva` ante `429`/`503`, respeta `maxPorPasada` y se integra opcionalmente en `ejecutarPasadaFuente`.
