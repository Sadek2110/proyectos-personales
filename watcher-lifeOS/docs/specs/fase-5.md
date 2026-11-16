# Especificación Fase 5 — Conector Google Classroom (`ClassroomSource` — Opción B)

## 1. Objetivo y Alcance
Implementar en `course-watcher/src/fuentes/classroom.js` el conector `crearFuenteClassroom` (`ClassroomSource`) para el módulo **`ent` (`Entornos y Sintaxis en Python`)**, soportando:
1. **Opción B (Modo Correos de Notificación de Google Classroom)**:
   - Parsea los correos automáticos de Google Classroom (`no-reply@classroom.google.com` o reenviados desde `@g.educaand.es`) sin requerir desplegar ningún proyecto de Apps Script dentro de la cuenta corporativa del centro.
   - Genera lotes incrementales (`completa: false`, `fuente: 'classroom'`) para que nunca archive ítems previos cuando solo se leen los correos recientes.
2. **Modo Estructura / Puente JSON (`topics`, `courseWork`, `courseWorkMaterials`, `announcements`)**:
   - Normaliza respuestas estructuradas de Classroom (como `classroom_sample.json` o un webhook JSON) mapeando `topics` a unidades (`Inicio`, `U1`..`U4`), convirtiendo `dueDate` + `dueTime` (UTC) a hora local `Europe/Madrid` (`yyyy-MM-ddTHH:mm`), clasificando adjuntos de Drive (`.pdf` $\rightarrow$ `PDF`, `.ipynb` $\rightarrow$ `Notebook`, `.zip` $\rightarrow$ `ZIP`, vídeos $\rightarrow$ `Vídeo`) y extrayendo `drive_url`.

---

## 2. Contratos y Funciones (`course-watcher/src/fuentes/classroom.js`)

### 2.1. `parsearCorreoClassroom(correo, { idModulo = 'ent' } = {})`
- **Entrada (`correo`)**:
  ```json
  {
    "id": "msg_101",
    "subject": "Nueva tarea: \"Práctica U3: Diccionarios y conjuntos\"",
    "from": "Antonio Ortega (Google Classroom) <no-reply@classroom.google.com>",
    "date": "2026-11-15T10:30:00Z",
    "body": "Antonio Ortega ha publicado una nueva tarea en Entornos y Sintaxis en Python.\nFecha de entrega: 25 nov 2026 23:59\nAbrir: https://classroom.google.com/c/ODg3OTY0MTg0ODI4/a/cw_8002/details"
  }
  ```
- **Reglas de extracción**:
  1. **Tipo y nombre (`n`) desde `subject` / `body`**:
     - `Nueva tarea: "<título>"` / `New assignment: "<title>"` $\rightarrow$ `tipo: 'Entrega'`, `n: <título>`.
     - `Nueva pregunta: "<título>"` / `Nuevo cuestionario: "<título>"` $\rightarrow$ `tipo: 'Prueba'`, `n: <título>`.
     - `Nuevo material: "<título>"` / `New material: "<title>"` $\rightarrow$ clasifica por extensión o palabras clave en título/cuerpo (`.ipynb` o `cuaderno`/`notebook` o prefijo numérico `2.1 ...` si menciona colab/ipynb $\rightarrow$ `'Notebook'`, `.pdf` $\rightarrow$ `'PDF'`, `.zip` $\rightarrow$ `'ZIP'`, vídeo $\rightarrow$ `'Vídeo'`, por defecto `'PDF'` o `'Tema'`).
     - `Nuevo anuncio:` / `Nueva publicación` $\rightarrow$ `tipo: 'Anuncio'`, `n`: primera línea significativa del anuncio o asunto.
     - `Calificación publicada: "<título>"` / `Con calificación: "<título>"` / `Graded: "<title>"` $\rightarrow$ `tipo: 'Nota'`, extrae `calificacion` numérica si aparece en el cuerpo (ej. `Nota: 9,5 / 10` o `Calificación: 10/10` $\rightarrow$ `9.5` / `10`).
  2. **Identificador estable (`ext_id`)**:
     - Si el cuerpo contiene una URL de Classroom con ID de recurso (`/a/<id>/details`, `/m/<id>/details`, `/p/<id>`), usa `classroom:ent:item:<id>` (o `classroom:ent:cw:<id>` / `classroom:ent:cwm:<id>` / `classroom:ent:ann:<id>`).
     - En caso contrario, usa `classroom:${idModulo}:msg:${correo.id}`.
  3. **Unidad (`unidad`)**:
     - Si el cuerpo o asunto indica unidad explícita (`Unidad 3`, `U3`, `Tema 3`) o el título empieza por `1.`, `2.`, `3.`, `4.` (ej. `2.3d ...` $\rightarrow$ `U2`, `3.1 ...` $\rightarrow$ `U3`, ` Práctica U3...` $\rightarrow$ `U3`), asigna `U1`..`U4`.
     - Si menciona `Presentación` o `Introducción al módulo`, asigna `Inicio`.
     - Por defecto: `General` (o `U1`..`U4` según coincidencia).
  4. **Fecha de entrega (`fecha`)**:
     - Soporta formatos en el cuerpo del correo:
       - ISO: `Fecha de entrega: 2026-11-25 23:59` o `2026-11-25T23:59` $\rightarrow$ `'2026-11-25T23:59'`.
       - Español: `Fecha de entrega: 25 nov 2026 23:59` (o `25 de noviembre de 2026, 23:59` o sin hora $\rightarrow$ `23:59`) $\rightarrow$ `'2026-11-25T23:59'`.

---

### 2.2. `normalizarEstructuraClassroom(datos, { idModulo = 'ent', nombreModulo = 'Entornos y Sintaxis en Python' } = {})`
- **Entrada (`datos`)**: objeto con `courses`, `topics`, `courseWork`, `courseWorkMaterials`, `announcements`.
- **Comportamiento**:
  1. Mapea cada `topic` en `datos.topics` a una unidad `{ k, t, items: [] }`:
     - `"Presentación"` / `"Inicio"` $\rightarrow$ `k: 'Inicio'`
     - `"U1 · Introducción"` $\rightarrow$ `k: 'U1'`, `t: 'Introducción'`
     - `"U2 · Sintaxis básica"` $\rightarrow$ `k: 'U2'`, `t: 'Sintaxis básica'`
     - `"U3 · Colecciones"` $\rightarrow$ `k: 'U3'`, `t: 'Colecciones'`
     - `"U4 · Depuración y pruebas"` $\rightarrow$ `k: 'U4'`, `t: 'Depuración y pruebas'`
  2. Procesa `courseWork` (solo `state === 'PUBLISHED'` o sin estado):
     - `ext_id`: `classroom:${courseId}:cw:${cw.id}`
     - `tipo`: `'Entrega'` (si `workType === 'ASSIGNMENT'`), `'Prueba'` (si `QUIZ` / `SHORT_ANSWER_QUESTION` / `MULTIPLE_CHOICE_QUESTION`).
     - `fecha`: convierte `cw.dueDate` (`{ year, month, day }`) + `cw.dueTime` (`{ hours, minutes }` en UTC) a hora local `Europe/Madrid` (`yyyy-MM-ddTHH:mm`) usando `formatearFechaMadrid`.
  3. Procesa `courseWorkMaterials`:
     - `ext_id`: `classroom:${courseId}:cwm:${cwm.id}`
     - Determina `tipo` inspeccionando `cwm.materials` (`driveFile.driveFile.title`): `.ipynb` $\rightarrow$ `'Notebook'`, `.pdf` $\rightarrow$ `'PDF'`, `.zip` $\rightarrow$ `'ZIP'`, `youtubeVideo` $\rightarrow$ `'Vídeo'`, `link` $\rightarrow$ `'Enlace'`, por defecto `'Tema'`.
     - Si tiene `driveFile`, guarda `drive_url: driveFile.alternateLink` y extrae `archivos` si procede.
  4. Procesa `announcements`:
     - `ext_id`: `classroom:${courseId}:ann:${ann.id}`
     - `tipo`: `'Anuncio'`, `n`: primera línea o primeros 100 caracteres de `ann.text`, ubicado en unidad `'Inicio'` o `'General'`.

---

### 2.3. `crearFuenteClassroom(opciones)`
- Soporta:
  - `leerCorreos`: función asíncrona que devuelve array de correos de notificación de Classroom $\rightarrow$ genera lote con `{ fuente: 'classroom', completa: false, modulos: [...] }`.
  - `leerEstructura` o `gasUrl`: función asíncrona o endpoint JSON que devuelve estructura completa de Classroom $\rightarrow$ genera lote con `{ fuente: 'classroom', completa: true, modulos: [...] }`.

---

## 3. Criterios de Aceptación (TDD)

- **CA-5.1 (Normalización de estructura Classroom desde `classroom_sample.json` y conversión UTC $\rightarrow$ `Europe/Madrid`)**:
  - `normalizarEstructuraClassroom` transforma `classroom_sample.json` generando el módulo `ent` con las unidades `Inicio`, `U1`, `U2`, `U3`, `U4`.
  - Convierte la entrega `cw_8001` (`dueDate: 2026-10-13`, `dueTime: 21:59 UTC`) a `fecha: '2026-10-13T23:59'` (hora de Madrid CEST), clasifica `Presentacion.pdf` y `U1_Introduccion.pdf` como `'PDF'`, `2_3c_operadores_logicos.ipynb` como `'Notebook'` (con su `drive_url`) y `ann_7001` como `'Anuncio'`.
- **CA-5.2 (Opción B — Parseo de correos de notificación de Google Classroom)**:
  - `parsearCorreoClassroom` y `crearFuenteClassroom({ leerCorreos })` extraen correctamente desde `correos_sample.json`:
    1. Una entrega nueva (`Nueva tarea: ...`) con su fecha límite en español (`25 nov 2026 23:59` $\rightarrow$ `'2026-11-25T23:59'`), su unidad (`U3`) y su `ext_id` extraído del enlace de Classroom.
    2. Un material nuevo (`Nuevo material: "3.1 Listas y tuplas.ipynb"`) clasificado como `'Notebook'` en `U3`.
    3. Un anuncio nuevo (`Nuevo anuncio...`) clasificado como `'Anuncio'`.
    4. Una calificación publicada (`Con calificación: "Práctica: diagrama de flujo"`) con su nota numérica (`9.5`).
- **CA-5.3 (Lote incremental `completa: false` en modo correos sin archivar el temario existente)**:
  - Al ingerir en `crearAlmacenTemario` de `life-os` el lote generado por `crearFuenteClassroom` en modo correos (`completa: false`), los ítems nuevos se añaden al módulo `ent`, se vinculan los ítems de semilla que coincidan por nombre sin perder su `nota` manual, y **ningún** ítem previo de `ent` se marca como `archivado`.
- **CA-5.4 (Idempotencia con el motor de Diff de Fase 3)**:
  - Al pasar dos veces seguidas los mismos correos o la misma estructura por `ejecutarPasadaFuente`, la segunda pasada produce `{ nuevos: 0, cambiados: 0, archivados: 0, notasNuevas: 0 }` y `enviado: false`.
