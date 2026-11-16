# Especificación Fase 6 — Curso 2: Especialización en Ciberseguridad (Aula Virtual FP Ceuta)

## 1. Objetivo y Alcance
Integrar el **Curso 2 — Especialización en Ciberseguridad** (`https://www.mecd.es/aulavirtualfpceuta`) tanto en `course-watcher/` como en `life-os/`, reutilizando `MoodleApiSource` en modo de autenticación directa (`POST /login/token.php?service=moodle_mobile_app`) para los **6 módulos** matriculados:
1. **`brs` (`courseId: 311`)**: *Bastionado de redes y sistemas* (`corto: 'Bastionado'`)
2. **`afi` (`courseId: 177`)**: *Análisis forense informático* (`corto: 'Forense'`)
3. **`pps` (`courseId: 175`)**: *Puesta en producción segura* (`corto: 'Producción'`)
4. **`nc` (`courseId: 174`)**: *Normativa de ciberseguridad* (`corto: 'Normativa'`)
5. **`ic` (`courseId: 173`)**: *Incidentes de ciberseguridad* (`corto: 'Incidentes'`)
6. **`he` (`courseId: 172`)**: *Hacking ético* (`corto: 'Hacking'`)

---

## 2. Contratos y Componentes

### 2.1. Catálogo y Conector de Ciberseguridad en `course-watcher/`
En `course-watcher/src/fuentes/moodle.js` (y re-exportado en `course-watcher/src/index.js`):
- **`CURSOS_PYTHON_MOODLE`**:
  ```js
  [
    { id: 2005, codigo: 'est', nombre: 'Estructuras de control en Python' },
    { id: 2475, codigo: 'poo', nombre: 'Programación orientada a objetos' },
    { id: 2006, codigo: 'ana', nombre: 'Análisis de datos en Python' },
  ]
  ```
- **`CURSOS_CIBER_MOODLE`**:
  ```js
  [
    { id: 311, codigo: 'brs', corto: 'Bastionado', nombre: 'Bastionado de redes y sistemas' },
    { id: 177, codigo: 'afi', corto: 'Forense', nombre: 'Análisis forense informático' },
    { id: 175, codigo: 'pps', corto: 'Producción', nombre: 'Puesta en producción segura' },
    { id: 174, codigo: 'nc',  corto: 'Normativa', nombre: 'Normativa de ciberseguridad' },
    { id: 173, codigo: 'ic',  corto: 'Incidentes', nombre: 'Incidentes de ciberseguridad' },
    { id: 172, codigo: 'he',  corto: 'Hacking', nombre: 'Hacking ético' },
  ]
  ```
- **`crearFuenteMoodle`**:
  - Acepta parámetro opcional `nombreFuente = 'moodle'` para que `obtenerLote()` devuelva `{ fuente: nombreFuente, origen: nombreFuente, completa: true, modulos, userid }` y normalice cada ítem con `origen: nombreFuente`.
- **`crearFuenteCiberseguridad(opciones = {})`**:
  - Envuelve `crearFuenteMoodle` con valores por defecto para el Aula Virtual FP Ceuta:
    - `baseUrl: opciones.baseUrl || process.env.CIBER_URL || 'https://www.mecd.es/aulavirtualfpceuta'`
    - `modoAuth: 'directo'`
    - `nombreFuente: 'ciber'`
    - `nombreCurso: 'FP Especialización Ciberseguridad'`
    - `cursos: opciones.cursos || CURSOS_CIBER_MOODLE`

### 2.2. Normalización de Secciones y Módulos de Ciberseguridad (`course-watcher/src/normalizador.js`)
- `inferirUnidadMoodle(idModulo, seccion)` mapea las secciones específicas de los 6 módulos de Ciberseguridad:
  - `"General"` / `"Normativa de Ciberseguridad (CETI_NDC01)"` (sección 0) $\rightarrow$ `{ k: 'General', t: seccion.name }`
  - `"CRITERIOS DE EVALUACIÓN Y CALIFICACIÓN"` / `"CALENDARIO 26-27"` $\rightarrow$ `{ k: 'Inicio', t: seccion.name }`
  - `"TEMA 1.- ..."` .. `"Tema 10"` $\rightarrow$ `k: 'T1'` .. `'T10'`
  - `"UT01.- ..."` .. `"UT05.- ..."` $\rightarrow$ `k: 'UT1'` .. `'UT5'`
  - `"1. Desarrollo..."` .. `"7. SIEM ELK"` $\rightarrow$ `k: 'UD1'` .. `'UD7'`
  - `"Exámenes"` $\rightarrow$ `{ k: 'Exámenes', t: 'Exámenes' }`
- `inferirTipoMoodle`:
  - Ignora todos los separadores `modname === 'label'` (`Orientaciones`, `Contenidos`, `Recursos`, `Evaluación`).
  - Clasifica `book` y `page` sin archivo adjunto como `'Tema'`.

### 2.3. Registro de Módulos de Ciberseguridad en `life-os/` (`src/clase.mjs` y `agente/temario.js`)
1. En `life-os/src/clase.mjs`:
   - Exportar `MODULOS_CIBER` con la definición base de los 6 módulos (`brs`, `afi`, `pps`, `nc`, `ic`, `he`), cada uno con su `id`, `corto`, `nombre`, `color` (`var(--l-tareas)`, `var(--l-compras)`, `var(--l-rutas)`, `var(--l-clase)`), `ahora`, `curso: 'ciber'`, `meta` (`'Especialización en Ciberseguridad · Aula Virtual FP Ceuta'`), `aula: { texto: 'Abrir en Moodle Ceuta', url: 'https://www.mecd.es/aulavirtualfpceuta/course/view.php?id=<id>' }` y `unidades: []`.
2. En `life-os/agente/temario.js`:
   - Cuando `ingestar(lote)` recibe ítems o módulos cuyo `modulo` (`brs`, `afi`, `pps`, `nc`, `ic`, `he` u otro) aún no está en `estado.modulos`, busca su plantilla en `MODULOS_CIBER` (o crea una ficha válida con `aula`, `corto`, `color`, `meta` y `unidades: []`) y la añade a `estado.modulos`.
   - En siguientes pasadas, preserva todos los campos manuales del módulo (`corto`, `color`, `ahora`, `meta`, `aula`) y de sus ítems (`nota`, `alerta`), y archiva únicamente los ítems con `origen === 'ciber'` cuando llega un lote con `completa: true` y `origen: 'ciber'`, sin tocar jamás los módulos de `'moodle'` ni `'classroom'`.

---

## 3. Criterios de Aceptación (TDD)

- **CA-6.1 (Normalización de los 6 módulos de Ciberseguridad desde las fixtures reales)**:
  - `crearFuenteCiberseguridad` con las 6 fixtures de `course-watcher/test/fixtures/ciber/` (`course_311`, `177`, `175`, `174`, `173`, `172`, `assignments.json`, `site_info.json`) genera el lote con `fuente: 'ciber'`, `completa: true` y los 6 módulos (`brs`, `afi`, `pps`, `nc`, `ic`, `he`), sumando más de 150 ítems reales, omitiendo todas las etiquetas `label`, mapeando correctamente las unidades (`General`, `Inicio`, `T1`..`T3`, `UT1`..`UT5`, `UD1`..`UD7`) y cruzando las 19 entregas de `assignments.json` con sus fechas en `Europe/Madrid`.
- **CA-6.2 (Ingesta de los 6 módulos de Ciberseguridad en `life-os` y aislamiento entre fuentes)**:
  - Al ingerir el lote de `ciber` en `crearAlmacenTemario` de `life-os`, se incorporan automáticamente los 6 módulos de Ciberseguridad junto a los 4 de Python (total 10 módulos en `temario.json`) con sus metadatos completos (`corto`, `color`, `aula.url`, `meta`).
  - Una ingesta con `completa: true` de `origen: 'ciber'` no archiva ningún ítem de `origen: 'moodle'` ni de `origen: 'classroom'`, y viceversa.
- **CA-6.3 (Preservación de campos manuales e idempotencia en segunda pasada)**:
  - Si el usuario añade una `nota` manual o cambia `ahora`/`color` en un módulo de Ciberseguridad (`brs`), una segunda ingesta del lote completo de `ciber` preserva intactos esos campos manuales y devuelve `{ nuevos: 0, cambiados: 0, archivados: 0 }`.
