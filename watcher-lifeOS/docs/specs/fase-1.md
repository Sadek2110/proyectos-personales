# Especificación Fase 1 — Life OS: El Temario como Dato

## 1. Objetivo
Convertir el temario de la sección **Clase** de `life-os` (actualmente estático en `src/clase.mjs`) en un dato persistido en `/data/temario.json`, servido por `GET /api/clase/temario` y actualizable de forma idempotente mediante `POST /api/ingesta/clase`, manteniendo `src/clase.mjs` como semilla inicial y fallback, sin perder jamás el progreso marcado en Google Sheets ni los campos manuales.

---

## 2. Contratos de API y Almacenamiento

### 2.1. Almacén `/data/temario.json` (`agente/temario.js` o módulo dedicado)
- Si `/data/temario.json` no existe al leer por primera vez, se inicializa a partir de `CLASE` (`src/clase.mjs`).
- Escritura atómica en disco (`temario.json.<pid>.tmp` $\rightarrow$ `renameSync`).
- Estructura:
  ```json
  {
    "version": 1,
    "actualizado": "2026-11-15T20:00:00",
    "fuentes": {},
    "modulos": [ /* array con la misma forma que CLASE */ ],
    "mapaIds": {},
    "novedades": []
  }
  ```

### 2.2. `GET /api/clase/temario`
- **Autenticación**: Requiere cookie de sesión válida (`sesionValida(req)`). Sin sesión devuelve `401 { ok: false, error: 'Sesión caducada' }`.
- **Respuesta (`200 OK`)**:
  ```json
  {
    "ok": true,
    "data": {
      "version": 1,
      "actualizado": "2026-11-15T20:00:00",
      "fuentes": {},
      "modulos": [ ... ],
      "mapaIds": {},
      "novedades": []
    }
  }
  ```

### 2.3. `POST /api/ingesta/clase`
- **Autenticación**: Cabecera `Authorization: Bearer <INGESTA_TOKEN>` comparada en tiempo constante con `ENV.ingestaToken` (`process.env.INGESTA_TOKEN`).
  - Sin cabecera, con token incorrecto o si `INGESTA_TOKEN` está vacío en el servidor $\rightarrow$ `401 { ok: false, error: 'No autorizado' }`.
- **Cuerpo de entrada**:
  ```json
  {
    "origen": "moodle",
    "completa": false,
    "items": [
      {
        "ext_id": "moodle:2005:cm:354210",
        "origen": "moodle",
        "modulo": "est",
        "unidad": "UD3",
        "unidad_titulo": "Sentencias iterativas",
        "n": "Proyecto U3: mapa web de volcanes con Folium",
        "tipo": "Entrega",
        "fecha": "2026-11-11T23:59",
        "url": "https://...",
        "publicado": "2026-11-01T10:00",
        "hash": "a1b2c3d4e5f60123"
      }
    ],
    "estadoFuente": { "ok": true, "error": "" }
  }
  ```
- **Reglas de negocio en la ingesta**:
  1. **Upsert por `ext_id`**: Si existe un item con el mismo `ext_id`, se actualiza.
  2. **Emparejamiento inicial con semilla (`clase.mjs`)**: Si no hay ningún item con ese `ext_id`, se busca en el mismo `modulo` y `unidad` un item sin `ext_id` cuyo nombre `n` coincida (normalizando espacios/signos de puntuación o prefijos). Si coincide:
     - Se guarda `it.id_antiguo = "${m.id}/${u.k}/${it.n}"`.
     - Se registra `mapaIds[it.id_antiguo] = item.ext_id`.
     - Se le asigna `ext_id`.
  3. **Preservación estricta de campos manuales**:
     - En el item existente **nunca** se pisan `nota` ni `alerta`.
     - En el módulo **nunca** se pisan `corto`, `nombre`, `color`, `ahora`, `meta` ni `aula`.
  4. **Idempotencia**: Si un item ya tiene `ext_id` y ninguno de sus campos de plataforma (`n`, `tipo`, `fecha`, `url`, `calificacion`, `archivado`) ha cambiado, no cuenta como `cambiado` ni genera novedad.
  5. **Archivado sin borrado**: Cuando `completa: true` para un `origen` y `modulo`, cualquier item previo de ese mismo `origen` y `modulo` que tenga `ext_id` y no venga en el lote pasa a `archivado: true` (incrementando `archivados`), pero no se elimina del array.
- **Respuesta (`200 OK`)**:
  ```json
  {
    "ok": true,
    "data": { "nuevos": 1, "cambiados": 0, "archivados": 0 }
  }
  ```

---

## 3. Criterios de Aceptación (TDD)

- **CA-1.1 (Semilla inicial)**: Sin `/data/temario.json` previo, `GET /api/clase/temario` devuelve los 4 módulos de `src/clase.mjs` intactos.
- **CA-1.2 (Seguridad de ingesta)**: `POST /api/ingesta/clase` rechaza con `401` peticiones sin token o con token inválido, y exige sesión en `GET /api/clase/temario`.
- **CA-1.3 (Idempotencia)**: Enviar dos veces seguidas el mismo lote a `POST /api/ingesta/clase` devuelve `{ nuevos: N, cambiados: 0, archivados: 0 }` en la primera llamada y `{ nuevos: 0, cambiados: 0, archivados: 0 }` en la segunda.
- **CA-1.4 (Protección de campos manuales)**: Al actualizar un item existente de `clase.mjs` (como `Proyecto U2: calculadora de precio final`) con nueva fecha o URL, su campo `nota` manual y los campos del módulo (`ahora`, `color`, `meta`) permanecen intactos.
- **CA-1.5 (Migración de IDs y renombrado sin pérdida de progreso)**: Si un item tenía progreso marcado con su ID antiguo (`est/UD2/Proyecto U2: calculadora de precio final`), se vincula a `ext_id` en la primera ingesta y, aunque en una segunda ingesta el profesor le cambie el nombre `n`, `hechoItem` sigue devolviendo `true` y `marcarClase` acepta tanto el ID antiguo como el `ext_id`.
- **CA-1.6 (Archivado)**: Si un item con `ext_id` desaparece en una ingesta con `completa: true`, queda marcado con `archivado: true` y no se borra.
- **CA-1.7 (No regresión)**: Los 61 tests previos de `life-os` siguen pasando en verde.
