---
name: lifeos-temario-ingesta
description: >-
  Contrato técnico para la Fase 1 y Fase 4 en Life OS: almacenamiento en
  /data/temario.json, endpoints GET /api/clase/temario y POST /api/ingesta/clase,
  migración sin pérdida de IDs antiguos (modulo/unidad/nombre a ext_id),
  preservación de campos manuales y avisos Web Push de novedades.
---

# Ingesta de Temario y Migración en Life OS

Esta skill define cómo se integra el temario dinámico en `life-os` sin romper la funcionalidad actual ni perder el progreso del usuario.

## 1. Almacenamiento en `/data/temario.json`

- Al arrancar `life-os`, si `/data/temario.json` no existe, se inicializa tomando `CLASE` de `src/clase.mjs` como **semilla**.
- Escritura atómica igual que `agente/almacen.js`: escribir en `temario.json.<pid>.tmp` y renombrar con `fs.renameSync`.
- Estructura de `/data/temario.json`:
  ```json
  {
    "version": 1,
    "actualizado": "2026-11-15T19:00:00",
    "fuentes": {
      "moodle": { "ultimaPasada": "2026-11-15T19:00:00", "ok": true, "fallosSeguidos": 0, "error": "" }
    },
    "modulos": [ /* misma estructura jerárquica que CLASE en src/clase.mjs, enriquecida con ext_id, origen, publicado, hash, archivado */ ],
    "mapaIds": {
      "est/UD2/Proyecto U2: calculadora de precio final": "moodle:2005:cm:48213"
    },
    "novedades": [
      /* cola/historial de cambios detectados para mostrar en UI y enviar por Web Push */
    ]
  }
  ```

## 2. Preservación de Campos Manuales

Cuando `POST /api/ingesta/clase` recibe un lote de `items` del watcher:
1. Busca el item existente primero por `ext_id`.
2. Si no tiene `ext_id` aún (item procedente de la semilla `clase.mjs`), busca coincidencia dentro del mismo `modulo` y `unidad` por nombre normalizado (o por título similar) y le asigna el `ext_id`, registrando la equivalencia `idAntiguo -> ext_id` en `mapaIds`.
3. **Campos que actualiza el watcher**: `n`, `tipo`, `fecha`, `url`, `publicado`, `hash`, `origen`, `ext_id`.
4. **Campos manuales intocables**: `nota`, `alerta` (a nivel de item) y `corto`, `color`, `ahora`, `meta`, `aula` (a nivel de módulo), además de `tri`, `h`, `sum` (a nivel de unidad, salvo unidades nuevas creadas por el watcher).
5. **Archivado**: Si un item con el mismo `origen` y `modulo` que antes estaba activo ya no viene en el lote completo de esa fuente, se marca `archivado: true` (no se borra del JSON ni se pierde su estado de completado).

## 3. Compatibilidad de Progreso (`hechoItem` y Migración de IDs)

En la pestaña `Clase` de Google Sheets, el usuario ya tiene filas guardadas con el formato antiguo `modulo/unidad/nombre` (ej. `est/UD2/Proyecto U2: calculadora de precio final`).
Para no perder nada ni siquiera si el profesor renombra el item en Moodle:
- `hechoItem(ctx, m, u, it)` comprobará:
  1. Si tiene tarea enlazada (`tareaDeItem` por `ext_id` o por `tituloClase(m, it)`), usa `!!t.completada`.
  2. Si `it.ext_id && ctx.hecho?.[it.ext_id]`, devuelve `true`.
  3. Si `ctx.hecho?.[`${m.id}/${u.k}/${it.n}`]`, devuelve `true`.
  4. Si `it.id_antiguo && ctx.hecho?.[it.id_antiguo]`, devuelve `true`.

## 4. Endpoints HTTP en `server.js`

- **`GET /api/clase/temario`** (o función `clase/temario` vía `/api/`):
  - Requiere sesión válida de usuario (`sesionValida(req)`).
  - Devuelve `{ ok: true, data: { modulos, actualizado, fuentes, novedades } }`.
- **`POST /api/ingesta/clase`**:
  - Autenticación propia máquina-a-máquina mediante cabecera `Authorization: Bearer <INGESTA_TOKEN>`, comparada con `igual(tokenRecibido, ENV.ingestaToken)`.
  - Si `INGESTA_TOKEN` no está configurado o no coincide $\rightarrow$ `401`.
  - Devuelve `{ ok: true, data: { nuevos, cambiados, archivados } }`.
