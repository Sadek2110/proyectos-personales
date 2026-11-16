# Especificación Fase 4 — Avisos Web Push de Novedad en Life OS

## 1. Objetivo y Alcance
Añadir en `life-os` (`agente/temario.js` y `agente/planificador.js`) el sistema de notificaciones Web Push de novedades del curso según la sección 5 del Brief:
- Entrega o prueba nueva $\rightarrow$ push `📌 Nueva entrega: …` / `📌 Nueva prueba: …` (y entra automáticamente en los hitos de 3 días / 24 h / 3 h ya existentes).
- Fecha de entrega/prueba cambiada $\rightarrow$ push `⚠️ Cambio de fecha: …`.
- Tema, material o vídeo nuevo $\rightarrow$ push agrupado por módulo (`3 novedades en POO` o `Nueva publicación en POO` si es 1).
- Anuncio del profesor $\rightarrow$ push `📢 Anuncio en <Módulo>`.
- Nota publicada $\rightarrow$ push `🎓 Nota publicada en <Módulo>`.
- Respeto estricto del horario de silencio (`23:00` a `07:30`): lo que entre de noche no notifica durante la noche y se agrupa para la mañana (`>= 07:30`).
- Deduplicación persistente en `estado.enviados` para que ningún aviso se repita jamás.

---

## 2. Contratos de Datos y Funciones

### 2.1. Registro de Novedades en `life-os/agente/temario.js` (`ingestar`)

1. **Soporte dual de carga (`items` planos o `modulos` jerárquicos)**:
   - Si `lote.modulos` es un array (formato enviado por `course-watcher`), `ingestar(lote)` extrae todos sus ítems (`modulo: m.id, unidad: u.k, unidad_titulo: u.t, ...it`) y sus `calificaciones` (`m.calificaciones`), manteniendo 100% de compatibilidad con `lote.items` planos.
2. **Generación de entradas en `estado.novedades`**:
   - **Entrega o Prueba nueva**:
     ```json
     {
       "ext_id": "moodle:2005:cm:50001",
       "modulo": "est",
       "moduloCorto": "Estructuras",
       "unidad": "UD3",
       "n": "Proyecto U3: mapa web",
       "tipo": "Entrega",
       "fechaItem": "2026-11-20T23:59",
       "evento": "nuevo",
       "fecha": "2026-11-15T19:00:00"
     }
     ```
   - **Tema, Material o Vídeo nuevo** (`PDF`, `Notebook`, `Vídeo`, `Enlace`, `ZIP`, `Datos`, `Tema`, `Recurso`):
     - Misma estructura con `evento: 'nuevo'`.
   - **Anuncio del profesor nuevo** (`tipo === 'Anuncio'`):
     - Misma estructura con `evento: 'nuevo'` y `tipo: 'Anuncio'`.
   - **Cambio de fecha de una Entrega o Prueba existente** (incluyendo cuando un ítem de semilla se vincula o actualiza con una `fecha` distinta a la que tenía):
     ```json
     {
       "ext_id": "moodle:2005:cm:48213",
       "modulo": "est",
       "moduloCorto": "Estructuras",
       "unidad": "UD2",
       "n": "Proyecto U2: calculadora de precio final",
       "tipo": "Entrega",
       "fechaAnterior": "2026-11-06T23:59",
       "fechaItem": "2026-11-08T23:59",
       "evento": "cambio_fecha",
       "fecha": "2026-11-15T19:00:00"
     }
     ```
   - **Nota publicada o modificada** (cuando cambia `raw.calificacion` en un ítem, cuando llega un ítem con `tipo === 'Nota'`, o cuando `m.calificaciones` trae una nota con `graderaw !== null` nueva o distinta):
     ```json
     {
       "ext_id": "moodle:2005:grade:141499",
       "modulo": "est",
       "moduloCorto": "Estructuras",
       "unidad": "General",
       "n": "Prueba práctica U2",
       "tipo": "Nota",
       "calificacion": 10,
       "evento": "nota",
       "fecha": "2026-11-15T19:00:00"
     }
     ```

---

### 2.2. Evaluación y Agrupación de Avisos en `life-os/agente/planificador.js`

#### En `evaluar({ ahora, copia, prefs, enviados })`:
- Si `prefs.tareas` está activo y **`!enSilencio(hhmm)`**, evalúa `copia.novedades || []`:
  1. **Entrega o Prueba nueva** (`nov.evento === 'nuevo' && (nov.tipo === 'Entrega' || nov.tipo === 'Prueba')`):
     - `clave`: `nov:act:${nov.ext_id}`
     - `tipo`: `'novedad'`, `tab`: `'clase'`, `ttl`: `12 * 3600`
     - `titulo`: `📌 Nueva ${nov.tipo.toLowerCase()}: ${nov.n}`
     - `cuerpo`: `${nov.moduloCorto || nov.modulo}${nov.fechaItem ? ` (${fechaHumana(nov.fechaItem)})` : ''}`
  2. **Cambio de fecha** (`nov.evento === 'cambio_fecha'` y `nov.fechaItem`):
     - `clave`: `nov:fec:${nov.ext_id}:${nov.fechaItem}`
     - `tipo`: `'novedad'`, `tab`: `'clase'`, `ttl`: `12 * 3600`
     - `titulo`: `⚠️ Cambio de fecha: ${nov.n}`
     - `cuerpo`: `${nov.moduloCorto || nov.modulo} · Ahora para el ${fechaHumana(nov.fechaItem)}`
  3. **Anuncio del profesor** (`nov.evento === 'nuevo' && nov.tipo === 'Anuncio'`):
     - `clave`: `nov:anu:${nov.ext_id}`
     - `tipo`: `'novedad'`, `tab`: `'clase'`, `ttl`: `12 * 3600`
     - `titulo`: `📢 Anuncio en ${nov.moduloCorto || nov.modulo}`
     - `cuerpo`: `${nov.n}`
  4. **Nota publicada** (`nov.evento === 'nota'` o `(nov.evento === 'nuevo' && nov.tipo === 'Nota')`):
     - `clave`: `nov:not:${nov.ext_id}:${nov.calificacion ?? ''}`
     - `tipo`: `'novedad'`, `tab`: `'clase'`, `ttl`: `12 * 3600`
     - `titulo`: `🎓 Nota publicada en ${nov.moduloCorto || nov.modulo}`
     - `cuerpo`: `${nov.n}${nov.calificacion !== undefined && nov.calificacion !== null ? `: ${nov.calificacion}` : ''}`
  5. **Temas, Materiales y Vídeos nuevos agrupados por módulo** (`nov.evento === 'nuevo'` y `nov.tipo` no es `'Entrega'`, `'Prueba'`, `'Anuncio'`, `'Nota'`):
     - Se descartan los que ya tengan `enviados['nov:mat:' + nov.ext_id]`.
     - Se agrupan por `nov.modulo`.
     - Para cada módulo con materiales pendientes `lista`:
       - `extIds = lista.map(x => x.ext_id).sort()`
       - `claveGrupo = 'nov:grp:' + modulo + ':' + extIds.join(',')`
       - Si `!enviados[claveGrupo]`:
         - `nombreMod = lista[0].moduloCorto || modulo`
         - `titulo`: `lista.length === 1 ? '1 novedad en ' + nombreMod : lista.length + ' novedades en ' + nombreMod`
         - `cuerpo`: `lista.map(x => x.n).slice(0, 5).join(', ')}`
         - Se añade aviso con `clave: claveGrupo`, `clavesItems: lista.map(x => 'nov:mat:' + x.ext_id)`, `tipo: 'novedad'`, `tab: 'clase'`, `ttl: 12 * 3600`, `titulo`, `cuerpo`.
- En `revisar()` dentro de `crearPlanificador`:
  - `refrescar()` incluye `novedades: actual?.novedades || []` en `copia`.
  - Cuando un aviso se entrega con éxito (`entregados > 0 || !reintentar`), además de guardar `estado.enviados[aviso.clave] = local`, si `Array.isArray(aviso.clavesItems)` marca también cada clave individual en `estado.enviados[c] = local` para que si más tarde llega un cuarto material en ese módulo, los 3 anteriores no vuelvan a incluirse en el nuevo grupo.

---

## 3. Criterios de Aceptación (TDD)

- **CA-4.1 (Entrega y Prueba nueva + entrada en hitos 3d/24h/3h)**:
  - Al ingerir una entrega nueva (`tipo: 'Entrega'`, `fecha: '2026-11-07T23:59'`), `evaluar` fuera del horario de silencio emite el aviso `📌 Nueva entrega: ...` (`clave: nov:act:<ext_id>`) y además la actividad entra automáticamente en la evaluación de hitos (`cl:<id>:...`).
- **CA-4.2 (Cambio de fecha de entrega)**:
  - Al cambiar la fecha de una entrega existente en `temario.ingestar`, se registra un evento `cambio_fecha` y `evaluar` emite `⚠️ Cambio de fecha: ...` con clave `nov:fec:<ext_id>:<nuevaFecha>`.
- **CA-4.3 (Agrupación por módulo de temas, materiales y vídeos)**:
  - Si llegan 3 materiales nuevos (`PDF`, `Notebook`, `Vídeo`) en el módulo `poo`, `evaluar` emite **un único** aviso agrupado con título `3 novedades en POO` y cuerpo con los nombres de los 3 materiales.
- **CA-4.4 (Anuncio del profesor y Nota publicada)**:
  - Un anuncio nuevo (`tipo: 'Anuncio'`) genera `📢 Anuncio en ...` (`nov:anu:<ext_id>`) y una calificación publicada (`evento: 'nota'` o `calificaciones` en el módulo) genera `🎓 Nota publicada en ...` (`nov:not:<ext_id>:<nota>`).
- **CA-4.5 (Horario de silencio 23:00-07:30 y agrupación matutina sin repetición)**:
  - Durante el horario de silencio (`23:00` a `07:29`), `evaluar` **no** emite ningún aviso de `tipo: 'novedad'`.
  - Si llegan novedades en dos pasadas nocturnas distintas (p. ej. 1 material a las `01:00` y 2 materiales a las `04:00` en `poo`), a las `07:30` se envían agrupadas en un solo push (`3 novedades en POO`).
  - Una vez enviado por `planificador.revisar()`, una segunda llamada a `revisar()` no repite ningún aviso; y si a las `10:00` llega un 4.º material nuevo en `poo`, solo avisa de `1 novedad en POO` (sin repetir los 3 anteriores).
