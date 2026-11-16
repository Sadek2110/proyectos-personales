# Especificación Fase 3 — Motor de Diff, Estado Persistente y Envío a Life OS

## 1. Objetivo y Alcance
Implementar en `course-watcher/` el motor de detección de cambios (`src/diff.js`), el almacén de estado persistente (`/data/watcher-estado.json`), el cliente HTTP autenticado hacia Life OS (`src/cliente-lifeos.js`) y el coordinador de pasadas (`src/orquestador.js`), garantizando que:
1. El paso de un **Estado A $\rightarrow$ Estado B** detecte con exactitud los ítems **nuevos**, **cambiados** (incluyendo cambios de fecha de entrega), **archivados** y **notas nuevas**.
2. Una **segunda pasada** con el mismo lote produzca **0 cambios** (`{ nuevos: 0, cambiados: 0, archivados: 0, notasNuevas: 0 }`) y no reenvíe tráfico innecesario a Life OS.
3. El **modo simulacro** (`MODO_SIMULACRO=true` / `simulacro: true`) calcule y devuelva el diff completo sin enviar peticiones a Life OS ni alterar el estado persistido.
4. El estado en `/data/watcher-estado.json` solo se consolide tras confirmar que `POST /api/ingesta/clase` respondió `200 OK` (transaccionalidad ante caídas de red).

---

## 2. Componentes y Contratos

### 2.1. Motor de Diff y Almacén de Estado (`course-watcher/src/diff.js`)

#### `calcularDiffLote(estadoFuentePrevio, loteActual)`
- **Entrada**:
  - `estadoFuentePrevio`: `{ itemsPorExtId: { [ext_id]: { ext_id, modulo, unidad, n, tipo, fecha, url, drive_url, hash, archivado } }, notasPorExtId: { [ext_id]: { ext_id, cmid, itemname, graderaw } } }` (puede ser `undefined` o vacío en la primera pasada).
  - `loteActual`: `{ fuente, completa, modulos: [{ id, nombre, unidades: [{ k, t, items }], calificaciones }] }`.
- **Salida**:
  ```json
  {
    "hayCambios": true,
    "resumen": {
      "nuevos": 2,
      "cambiados": 1,
      "archivados": 1,
      "notasNuevas": 1
    },
    "detalle": {
      "nuevos": [ ... ],
      "cambiados": [
        {
          "ext_id": "moodle:2005:cm:347772",
          "modulo": "est",
          "unidad": "UD2",
          "n": "Proyecto U2",
          "tipo": "Entrega",
          "fecha": "2026-11-08T23:59",
          "fechaAnterior": "2026-11-06T23:59",
          "cambioFecha": true
        }
      ],
      "archivados": [ ... ],
      "notasNuevas": [ ... ]
    },
    "nuevoEstadoFuente": {
      "itemsPorExtId": { ... },
      "notasPorExtId": { ... }
    }
  }
  ```
- **Reglas de comparación**:
  1. Un ítem es **nuevo** si su `ext_id` no existe en `estadoFuentePrevio.itemsPorExtId` o si estaba marcado con `archivado: true` y vuelve a aparecer.
  2. Un ítem es **cambiado** si ya existía (activo) y cambia su `hash`, su `unidad` (`u.k`) o su `drive_url`. Si `prev.fecha !== actual.fecha`, el objeto en `detalle.cambiados` incluye `cambioFecha: true` y `fechaAnterior: prev.fecha || null`.
  3. Un ítem es **archivado** (solo cuando `loteActual.completa === true`) si existía activo en `estadoFuentePrevio.itemsPorExtId` para alguno de los módulos incluidos en `loteActual.modulos` y ya no está presente en `loteActual`. En `nuevoEstadoFuente.itemsPorExtId` se conserva con `archivado: true`.
  4. Una calificación en `m.calificaciones` es **nota nueva** (`notasNuevas`) si su `ext_id` no existía en `estadoFuentePrevio.notasPorExtId` o si su `graderaw` cambió.

#### `crearAlmacenEstadoWatcher({ archivo, ahora = () => new Date() })`
- Persistencia atómica (`tmp` + `fs.renameSync`) en `archivo` (por defecto `.data/watcher-estado.json`).
- Métodos:
  - `leer()`: devuelve el estado completo `{ version: 1, actualizado, tokens: {}, archivosDrive: {}, fuentes: {} }`.
  - `obtenerEstadoFuente(fuente)`: devuelve `estado.fuentes[fuente] || { itemsPorExtId: {}, notasPorExtId: {}, fallosSeguidos: 0 }`.
  - `registrarExitoFuente(fuente, nuevoEstadoFuente, resumenDiff)`: actualiza `itemsPorExtId`, `notasPorExtId`, pone `fallosSeguidos: 0`, `ultimoError: null`, `ultimaPasadaOk: ISO`, `ultimoIntento: ISO` y `ultimoResumen: resumenDiff`.
  - `registrarFalloFuente(fuente, error)`: incrementa `fallosSeguidos` en 1, guarda `ultimoError: error.message || String(error)` y `ultimoIntento: ISO`, y devuelve `{ fallosSeguidos, debeAlertar: fallosSeguidos >= 2 }`.
  - `leerToken(fuente)` / `guardarToken(fuente, token)`: lee y persiste tokens de sesión en `estado.tokens[fuente]`.

---

### 2.2. Cliente HTTP hacia Life OS (`course-watcher/src/cliente-lifeos.js`)

#### `crearClienteLifeOs({ lifeosUrl, ingestaToken, fetchFn = global.fetch })`
- **`enviarLote(lote, { simulacro = false } = {})`**:
  - Si `simulacro === true`, no realiza ninguna llamada de red y devuelve `{ simulacro: true, enviado: false, respuesta: null }`.
  - Valida que `lifeosUrl` e `ingestaToken` estén definidos.
  - Envía `POST ${lifeosUrl}/api/ingesta/clase` con cabeceras:
    - `Authorization: Bearer ${ingestaToken}`
    - `Content-Type: application/json`
  - Envía el cuerpo JSON `{ fuente: lote.fuente, completa: lote.completa, modulos: lote.modulos, novedades: lote.novedades }`.
  - Si `resp.status` no es `2xx`, lanza `Error` con el código HTTP y mensaje devuelto.
  - Devuelve `{ simulacro: false, enviado: true, respuesta: await resp.json() }`.

---

### 2.3. Orquestador de Pasadas (`course-watcher/src/orquestador.js`)

#### `ejecutarPasadaFuente({ nombreFuente, fuente, almacenEstado, clienteLifeOs, simulacro = false, forzarEnvio = false })`
1. Ejecuta `const lote = await fuente.obtenerLote()`.
2. Obtiene el estado previo con `almacenEstado.obtenerEstadoFuente(nombreFuente)`.
3. Calcula `const diff = calcularDiffLote(estadoPrevio, lote)`.
4. Si `simulacro === true`:
   - No llama a `clienteLifeOs.enviarLote` (o lo llama con `{ simulacro: true }`) y **no** escribe en `almacenEstado`.
   - Devuelve `{ ok: true, simulacro: true, hayCambios: diff.hayCambios, resumen: diff.resumen, detalle: diff.detalle, enviado: false }`.
5. Si `diff.hayCambios || forzarEnvio`:
   - Adjunta `lote.novedades = diff.detalle` y envía el lote con `await clienteLifeOs.enviarLote(lote)`.
   - Solo si el envío tiene éxito, guarda el nuevo estado con `almacenEstado.registrarExitoFuente(nombreFuente, diff.nuevoEstadoFuente, diff.resumen)`.
6. Si `!diff.hayCambios && !forzarEnvio`:
   - Actualiza `registrarExitoFuente` (para refrescar `ultimaPasadaOk` y `fallosSeguidos: 0`) sin hacer `POST` a Life OS (`enviado: false`).
7. Si ocurre un error en `obtenerLote` o `enviarLote`, captura el fallo, invoca `almacenEstado.registrarFalloFuente(nombreFuente, err)` sin sobrescribir `itemsPorExtId`, y propaga o devuelve `{ ok: false, error: err.message, fallosSeguidos, debeAlertar }`.

---

## 3. Criterios de Aceptación (TDD)

- **CA-3.1 (Transición Estado A $\rightarrow$ Estado B: nuevos, cambiados, cambio de fecha, archivados y notas nuevas)**:
  - Dado un Estado A inicial, una primera pasada detecta todos los ítems como `nuevos`.
  - Al pasar a un Estado B donde se añade un ítem, se modifica la fecha de una entrega existente (`cambioFecha: true`, `fechaAnterior`), desaparece un ítem (con `completa: true`) y se publica una calificación nueva, `calcularDiffLote` devuelve exactamente `{ nuevos: 1, cambiados: 1, archivados: 1, notasNuevas: 1 }`.
- **CA-3.2 (Idempotencia en segunda pasada: 0 cambios)**:
  - Al ejecutar una segunda pasada con el mismo lote sobre el estado ya actualizado, `calcularDiffLote` devuelve `hayCambios: false` y `{ nuevos: 0, cambiados: 0, archivados: 0, notasNuevas: 0 }`, y `ejecutarPasadaFuente` no realiza ningún `POST` adicional a Life OS (`enviado: false`).
- **CA-3.3 (Modo Simulacro sin efectos secundarios)**:
  - Con `simulacro: true`, `ejecutarPasadaFuente` calcula y devuelve el diff completo (`resumen` y `detalle`), pero no invoca la red (`fetchFn` no recibe llamadas a `/api/ingesta/clase`) ni modifica `/data/watcher-estado.json`.
- **CA-3.4 (Transaccionalidad ante fallo de envío y contador de fallos seguidos)**:
  - Si `POST /api/ingesta/clase` falla (ej. HTTP 500 o caída de red), el `itemsPorExtId` en `/data/watcher-estado.json` **no** se actualiza (para que la siguiente pasada vuelva a detectar y enviar los cambios), `fallosSeguidos` se incrementa y al segundo fallo consecutivo indica `debeAlertar: true`.
- **CA-3.5 (Integración End-to-End en memoria Watcher $\rightarrow$ Life OS)**:
  - Conectando `ejecutarPasadaFuente` con el servidor o `crearAlmacenTemario` de `life-os`, el lote normalizado de Moodle se ingesta en `temario.json`, preserva los campos manuales de la semilla y una segunda pasada resulta en `{ nuevos: 0, cambiados: 0, archivados: 0 }`.
