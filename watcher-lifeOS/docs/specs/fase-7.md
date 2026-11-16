# Especificación Fase 7 — Despliegue, Cron, Salud de Fuentes y Observabilidad

## 1. Objetivo y Alcance
Completar la infraestructura operativa de `course-watcher/` y la observabilidad en `life-os/` según las secciones 4.11, 5, 6 y 10 del Brief:
1. **Planificador Cron interno en `course-watcher/src/cron.js`**:
   - Ejecución periódica cada `CRON_INTERVALO_MIN` (por defecto 120 min = 2 h) dentro de la franja `CRON_HORARIO` (por defecto `08:00-22:00` en `Europe/Madrid`).
   - Ejecución secuencial de todas las fuentes configuradas (`moodle`, `ciber`, `classroom`).
   - Reporte de latido (`estadoFuente: { ok, error, fallosSeguidos }`) a Life OS tras cada pasada (incluso cuando hay 0 cambios de contenido o cuando una fuente falla) para mantener siempre al día la «última actualización» y el estado de salud en `/data/temario.json`.
2. **Servidor HTTP ligero en `course-watcher/src/servidor.js`**:
   - `GET /healthz`: devuelve `200 OK` con el estado de salud de cada fuente vigilada.
   - `POST /ejecutar`: protegido con `Authorization: Bearer <INGESTA_TOKEN>` (comparación en tiempo constante `crypto.timingSafeEqual`), fuerza un ciclo inmediato (`forzar: true`) saltándose la restricción de horario si lo solicita el usuario.
3. **Alerta Web Push tras 2 fallos seguidos en `life-os/agente/planificador.js`**:
   - Si una fuente en `/data/temario.json` (`copia.fuentes[origen]`) acumula `fallosSeguidos >= 2` (`ok === false`), `evaluar` emite fuera del horario de silencio un aviso Web Push `⚠️ Fuente sin conexión: <origen>` (`clave: err:fuente:<origen>:<hoy>`), cumpliendo el criterio de éxito «Alerta en menos de 6 h si una fuente se rompe».
4. **Visibilidad de «Última actualización» y salud de fuentes en `life-os/src/vistas/Clase.jsx`**:
   - Muestra en la cabecera/pie de `Clase.jsx` la fecha/hora de última actualización y el estado de las fuentes conectadas (`moodle`, `classroom`, `ciber`), destacando visualmente si alguna fuente presenta fallos.

---

## 2. Contratos y Funciones

### 2.1. Cron y Demonio (`course-watcher/src/cron.js`)
- **`enVentanaCron(fechaHoraMadrid, rango = '08:00-22:00')`**:
  - Recibe una cadena `yyyy-MM-ddTHH:mm` (o `HH:mm`) y devuelve `true` si la hora actual está entre `desde` y `hasta` (inclusive).
- **`crearDemonioWatcher({ fuentes = [], almacenEstado, clienteLifeOs, horario = '08:00-22:00', intervaloMin = 120, simulacro = false, ahora = () => new Date() })`**:
  - **`ejecutarCiclo({ forzar = false } = {})`**:
    1. Calcula la hora actual en `Europe/Madrid`. Si `!forzar && !enVentanaCron(horaMadrid, horario)`, devuelve `{ ejecutado: false, motivo: 'fuera_de_horario', resultados: [] }`.
    2. Recorre secuencialmente cada `{ nombre, fuente }` de `fuentes`:
       - Ejecuta `const res = await ejecutarPasadaFuente({ nombreFuente: nombre, fuente, almacenEstado, clienteLifeOs, simulacro })`.
       - Si `!simulacro && clienteLifeOs`:
         - Si `res.ok && !res.enviado` (pasada sin cambios de ítems), envía un latido ligero a Life OS: `await clienteLifeOs.enviarLote({ origen: nombre, fuente: nombre, completa: false, items: [], estadoFuente: { ok: true, error: '', fallosSeguidos: 0 } })`.
         - Si `!res.ok` (la fuente falló al conectar o parsear), reporta el fallo a Life OS (ignorando errores de red si Life OS estuviera caído): `await clienteLifeOs.enviarLote({ origen: nombre, fuente: nombre, completa: false, items: [], estadoFuente: { ok: false, error: res.error, fallosSeguidos: res.fallosSeguidos } })`.
    3. Devuelve `{ ejecutado: true, horaMadrid, resultados }`.

### 2.2. Servidor HTTP de Course Watcher (`course-watcher/src/servidor.js`)
- **`crearServidorWatcher({ demonio, almacenEstado, ingestaToken })`**:
  - `GET /healthz`: responde `200` `{ ok: true, fuentes: almacenEstado ? almacenEstado.leer().fuentes : {} }`.
  - `POST /ejecutar`: verifica `Authorization: Bearer <ingestaToken>` con `crypto.timingSafeEqual`. Si no coincide o falta token, responde `401` `{ ok: false, error: 'No autorizado' }`. Si es válido, ejecuta `await demonio.ejecutarCiclo({ forzar: true })` y responde `200` `{ ok: true, data: resultado }`.

### 2.3. Alerta de Fallo de Fuente en `life-os/agente/planificador.js` y `temario.js`
- En `life-os/agente/temario.js`:
  - Cuando `ingestar(lote)` actualiza `estado.fuentes[origen]`, si `lote.estadoFuente?.fallosSeguidos !== undefined`, guarda ese valor cuando `ok === false` (o incrementa `(previo.fallosSeguidos || 0) + 1`).
- En `life-os/agente/planificador.js`:
  - `copia` incluye `fuentes: actual?.fuentes || {}` (actualizado también en cada `revisar()` desde `storeTemario`).
  - En `evaluar({ ahora, copia, prefs, enviados })`:
    - Si `!enSilencio(hhmm)`, recorre `Object.entries(copia.fuentes || {})`:
    - Si `info && info.ok === false && Number(info.fallosSeguidos) >= 2`:
      - Añade aviso:
        ```js
        {
          clave: `err:fuente:${origen}:${hoy}`,
          tipo: 'alerta_fuente',
          tab: 'clase',
          ttl: 12 * 3600,
          titulo: `⚠️ Fuente con fallos: ${origen}`,
          cuerpo: `Lleva ${info.fallosSeguidos} fallos seguidos${info.error ? ` (${info.error})` : ''}.`,
        }
        ```

---

## 3. Criterios de Aceptación (TDD)

- **CA-7.1 (Ventana horaria `08:00-22:00` y ejecución forzada en `crearDemonioWatcher`)**:
  - `enVentanaCron` devuelve `true` entre `08:00` y `22:00` y `false` a las `07:59` o `22:01`.
  - Fuera del horario (`23:30` Madrid), `demonio.ejecutarCiclo()` devuelve `{ ejecutado: false, motivo: 'fuera_de_horario' }` sin consultar las fuentes; pero `demonio.ejecutarCiclo({ forzar: true })` sí ejecuta el ciclo completo.
- **CA-7.2 (Reporte de latido y propagación de fallos de fuente hacia Life OS)**:
  - Cuando una fuente falla 2 veces seguidas en `demonio.ejecutarCiclo()`, el watcher reporta `estadoFuente: { ok: false, error, fallosSeguidos: 2 }` a Life OS y `/data/temario.json` refleja `fuentes[origen].fallosSeguidos === 2` y `ok === false`.
- **CA-7.3 (Alerta Web Push tras 2 fallos seguidos en `planificador.js`)**:
  - Con 1 solo fallo (`fallosSeguidos: 1`), `evaluar` en `life-os` **no** emite alerta.
  - Al alcanzar 2 fallos seguidos (`fallosSeguidos: 2`, `ok: false`) fuera del horario de silencio, `evaluar` y `planificador.revisar()` emiten el aviso `⚠️ Fuente con fallos: <origen>` (`clave: err:fuente:<origen>:<hoy>`) y no lo repiten el mismo día. Durante el horario de silencio (`23:00-07:30`), la alerta se retiene hasta la mañana.
- **CA-7.4 (Servidor `/healthz` y `/ejecutar` en `course-watcher`)**:
  - `GET /healthz` devuelve `200 OK` con el resumen de fuentes.
  - `POST /ejecutar` rechaza con `401` peticiones sin token o con token inválido, y con `Bearer <INGESTA_TOKEN>` válido ejecuta `demonio.ejecutarCiclo({ forzar: true })` devolviendo `200 OK`.
