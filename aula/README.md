# Aula Conserjería · CCD2026

Web del curso **Competencias Digitales para conserjería** de la Cámara de Comercio de Ceuta (empieza el 8 de octubre de 2026). Con ella se presenta y se controla todo el curso: alumnado, temario, ejercicios, entregas, correcciones, asistencia y fichajes. Cada cambio se vuelca solo, a través de n8n, en el Excel de seguimiento y en la carpeta de entregas de Drive.

> **Estado: aparcado (6 de octubre de 2026).** La web está desplegada y la automatización funciona de punta a punta. Los datos de prueba ya están borrados de la web, del Excel y de Drive. Al final de este documento están los pendientes.

## Enlaces

| Qué | Dónde |
|---|---|
| Web del curso | https://aula.dksaa.com |
| n8n (automatización) | https://n8n.dksaa.com → flujo **«Aula Conserjería CCD2026»** |
| Código | GitHub `Sadek2110/aula-conserjeria` (privado), rama `main` |
| Servidor | Easypanel → proyecto `paginas_sencillas`, servicios `aula` (app) y `aula-db` (Postgres) |
| Excel de seguimiento | Drive → *Camara de comercio / 00 Organización y seguimiento / CCD2026 Seguimiento de alumnos* |
| Entregas del alumnado | Drive → *Camara de comercio / 03 Entregas de alumnos* |

---

## 1. Cómo funciona la web

Es una sola web con tres perfiles. Está pensada para personas de más de 45 años: diseño mobile first, texto de 18 px, botones grandes (mínimo 56 px) y los colores de la Cámara de Comercio. La sesión dura 60 días, así que el alumnado no tiene que poner la contraseña cada día.

### Alumnado

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Acceso | `/acceso` | Entrar con correo y contraseña. Tras 10 intentos fallidos se bloquea 15 minutos. |
| Registro | `/invitacion/:token` | Desde el enlace del correo: pone su nombre y su contraseña y acepta el uso de sus datos. Recibe su ID (`ALU001`, `ALU002`…). |
| Inicio | `/` | Botón grande para **fichar entrada y salida**, próxima clase, ejercicios pendientes, últimas correcciones y progreso del curso. |
| Calendario | `/calendario` | Por mes: clases, avisos del profesor (festivos, exámenes), fechas límite de ejercicios (marcadas si ya los entregó) y sus fichajes. |
| Temario | `/temario` y `/temario/:id` | Lee cada tema en la web y lo **descarga en PDF o Word**. Si el profesor subió su propio archivo, se descarga ese. |
| Ejercicios | `/ejercicios` y `/ejercicios/:id` | Enunciado, qué entregar y **subir la entrega** (Word, Excel, PDF, foto, ZIP; máximo 25 MB). Puede volver a entregar: cada vez es un intento nuevo y el anterior se conserva. Ve la nota y el comentario cuando está corregido. |
| Cuenta | `/cuenta` | Cambiar la contraseña. |

**Fichaje y asistencia.** Al fichar la entrada, si ese día hay clase, la asistencia se marca sola: **Presente**, o **Retraso** si llega más de 10 minutos tarde respecto a la hora de inicio de la sesión (con los minutos de retraso). Si el profesor ya había pasado lista, el fichaje no la cambia. Solo se puede fichar una entrada y una salida por día.

### Profesorado (`/profesor`)

| Pantalla | Qué hace |
|---|---|
| Panel | Resumen del día: próxima clase, quién ha fichado, entregas por corregir, media de notas y porcentaje de asistencia. |
| Sesiones | Programar las clases (`SES001`, `SES002`…; horario por defecto de 09:30 a 13:30), **pasar lista** (Presente, Retraso, Ausente, Justificada) y **cerrar la clase** con observaciones. |
| Alumnos | Lista con asistencia, ejercicios y media. **Invitar por Gmail** (varios correos a la vez). Ficha de cada alumno, editarlo o darlo de baja, y enviarle un enlace para cambiar la contraseña. |
| Correcciones | Entregas pendientes: descargar el archivo y poner **nota (0–10), nivel de autonomía (1–4), dificultad, acción de refuerzo y comentario** para el alumno. |
| Temario | Crear y editar unidades, temas y ejercicios (con fecha límite), ocultarlos o publicarlos y subir un archivo propio para cada tema. |
| Calendario | Avisos para el alumnado: aviso, festivo o examen. |

El curso viene cargado con el catálogo del Drive: **7 unidades, 20 temas y 20 ejercicios** y la sesión SES001 (8 de octubre).

### Administración (`/profesor/datos` y `/profesor/integraciones`)

- **Datos:** CRUD completo para ver, buscar, crear, editar y borrar cualquier registro de las 10 tablas: usuarios, unidades, temas, ejercicios, sesiones, eventos, fichajes, asistencia, resultados e invitaciones. El admin no puede borrarse ni quitarse el rol a sí mismo.
- **Integraciones n8n:** estado de la conexión, cola de eventos (pendientes, enviados y con error, con el motivo), botón para **reintentar** y botón para mandar un **evento de prueba**.
- El admin también puede usar todas las pantallas del profesor e invitar a otros profesores.

### Identificadores

Son los mismos en la web y en el Excel, y así n8n actualiza siempre la fila correcta en lugar de duplicarla:

| Dato | Formato | Ejemplo |
|---|---|---|
| Alumno | `ALUnnn` | `ALU001` |
| Sesión | `SESnnn` | `SES001` |
| Tema / ejercicio | `Tnn` / `Tnn_Enn` | `T01` / `T01_E01` |
| Asistencia | `SESIÓN_ALUMNO` | `SES001_ALU001` |
| Resultado (entrega) | `ALUMNO_EJERCICIO_Inn` | `ALU001_T01_E01_I01` |

---

## 2. Cómo funciona la automatización

```
  Web (aula.dksaa.com)                      n8n (n8n.dksaa.com)                     Google
 ┌────────────────────┐   POST + secreto   ┌─────────────────────────┐
 │ cada cambio guarda │ ─────────────────▶ │ Webhook /aula-ccd2026   │
 │ un evento en cola  │                    │   └─ Switch por evento ─┼──▶ Sheet «Seguimiento» (5 hojas)
 │ (eventos_n8n)      │ ◀───────────────── │ descarga archivo,       ├──▶ Drive «03 Entregas de alumnos»
 │ API /integraciones │   X-API-Key        │ devuelve enlace Drive   ├──▶ Gmail (invitaciones)
 └────────────────────┘                    └─────────────────────────┘
```

### De la web a n8n

1. Cada cambio importante (alta, fichaje, entrega, corrección…) guarda un **evento** en la tabla `eventos_n8n`, en la misma transacción que el dato: o se guardan los dos o ninguno.
2. Cada 5 segundos la app envía los pendientes, en orden, al webhook de n8n con la cabecera `X-Webhook-Secret`.
3. Si n8n falla, el evento se queda pendiente con el motivo del error y se reintenta con espera creciente (2, 4, 8… hasta 60 minutos). Tras 10 intentos queda en **error** y se puede reintentar a mano desde *Integraciones n8n*.

Cada aviso lleva este formato:
```json
{ "evento": "entrega.creada", "id_evento": 42, "fecha": "…", "curso_id": "CCD2026", "datos": { … } }
```

### El flujo de n8n «Aula Conserjería CCD2026»

| Evento | Qué hace n8n |
|---|---|
| `alumno.alta`, `alumno.actualizado` | Hoja **Alumnos**: crea o actualiza la fila por `alumno_id` |
| `alumno.borrado` | Hoja **Alumnos**: marca el estado como «Baja» y conserva el ID |
| `sesion.guardada`, `sesion.cerrada` | Hoja **Sesiones**, por `sesion_id` |
| `asistencia.actualizada` | Hoja **Asistencia**, por `asistencia_id` |
| `fichaje.entrada`, `fichaje.salida` | Hoja **Fichajes**, por `fichaje_id`: la salida completa la misma fila; horas en hora de Ceuta |
| `entrega.creada` | Descarga el archivo de la app → lo sube a Drive **«03 Entregas de alumnos»** con el nombre `ALU001_archivo.docx` → guarda el enlace de Drive en la app → fila en **Resultados** |
| `resultado.revisado` | Hoja **Resultados**: nota, nivel, dificultad y acción de refuerzo (conserva el enlace de Drive) |
| `invitacion.creada` | **Gmail**: envía la invitación con el asunto y el texto que prepara la app |
| `asistencia.borrada`, `resultado.borrado`, `sesion.borrada` | Busca la fila por su ID y la elimina |
| `prueba` y otros | No hace nada (sirve para comprobar la conexión) |

Todas las hojas se escriben con *Append or update* por ID, así que un reintento nunca duplica filas. Las fechas y las notas se guardan como fechas y números reales, y las fórmulas de la hoja **Resumen** (asistencia y media por alumno) se calculan solas.

**Credenciales en n8n:** `Google Sheets account`, `Google Drive account` y `Gmail account` (OAuth con sadekjoud@gmail.com), `X-Webhook-Secret` (Header Auth del webhook) y `X-API-Key` (Header Auth para llamar a la app). Los valores de los dos secretos están en las variables del servicio `aula` de Easypanel.

### De n8n a la web (API con cabecera `X-API-Key`)

| Llamada | Para qué |
|---|---|
| `GET /api/integraciones/entregas/:id/archivo` | Descargar el archivo de una entrega |
| `PATCH /api/integraciones/entregas/:id` con `{ "entrega_url": "…" }` | Guardar el enlace de Drive en la entrega |
| `GET /api/integraciones/export/:tabla` | Resincronizar el Excel completo: `alumnos`, `sesiones`, `asistencia`, `resultados`, `fichajes`, `catalogo` |

### Si algo deja de llegar al Excel

1. En la web, **Integraciones n8n**: mira el error del evento.
   - `n8n respondió 403`: el secreto de la credencial `X-Webhook-Secret` en n8n no coincide con `N8N_WEBHOOK_SECRET` de Easypanel. Revisa el *Name* (`X-Webhook-Secret`) y el *Value* (sin espacios).
   - `n8n respondió 404`: el flujo está desactivado en n8n.
   - `n8n respondió 500`: falla un nodo. En n8n → *Executions* se ve cuál (a menudo una credencial de Google caducada).
2. Arréglalo y pulsa **Reintentar**. Los eventos se envían en orden y sin duplicar.

---

## 3. Infraestructura

| Pieza | Detalle |
|---|---|
| App | Node 22 + Express 5 (API) y React + Vite + Tailwind (web), en una sola imagen Docker. |
| Base de datos | PostgreSQL 17 (`aula-db`). Las migraciones se aplican solas al arrancar. |
| Archivos | Volumen `/data` del servicio `aula` (entregas y archivos de temas). |
| Despliegue | Automático: cada push a `main` en GitHub redespliega el servicio `aula` en Easypanel. |
| n8n | Proyecto `automatizaciones` de Easypanel: `n8n`, `n8n-runner` y `n8n-db`. |

Variables del servicio `aula` (nombres; los valores están en Easypanel): `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`, `INTEGRACIONES_API_KEY`, `N8N_WEBHOOK_SECRET`, `N8N_WEBHOOK_URL=https://n8n.dksaa.com/webhook/aula-ccd2026`, `TOLERANCIA_RETRASO_MIN=10`. Opcionales: `SMTP_*`, para que la app envíe los correos ella misma.

### Desarrollo local

```bash
cp .env.example .env        # rellena DATABASE_URL y ADMIN_*
cd server && npm install && npm run dev
cd web && npm install && npm run dev   # http://localhost:5173 (redirige /api al puerto 3000)
```

Estructura: `server/` (API, `migrations/` con el esquema SQL, `seed/` con el catálogo del curso, `test/`), `web/` (React) y `Dockerfile` (imagen única para Easypanel).

## 4. Pruebas

En `server/test` hay **121 tests automáticos**, uno por cada requisito funcional (autenticación, CRUD del admin, invitaciones, temario, correcciones, clases, calendario, temario del alumno, entregas, fichaje e integración con n8n), además de pruebas unitarias. Usan una base de datos PostgreSQL en memoria y un n8n falso, así que no tocan producción.

```bash
cd server && npm install && npm test
```

Último resultado (6 de octubre de 2026): **121 de 121 pasan**.

## 5. Pendientes al aparcar

- [ ] **Cambiar la contraseña inicial del administrador** desde *Cuenta*.
- [ ] Comprobar que la app de Google Cloud está **publicada en producción**. En modo prueba las credenciales de Google de n8n caducan cada 7 días.
- [ ] Revocar la **clave de la API de n8n** que se creó para configurarlo (n8n → Settings → n8n API).
- [ ] Confirmar el horario real de SES001 y crear las siguientes sesiones.
- [ ] **Invitar al alumnado** (Alumnos → Invitar).
- [ ] Opcional: diario del profesor en **Notion** al cerrar una clase. El evento `sesion.cerrada` ya lleva el resumen; falta la credencial de Notion en n8n y el nodo.
- [ ] Opcional: hoja **Competencias** (evaluación 1–4 por competencia) y examen o proyecto final, que no están en la web.
- [ ] Opcional: dos mejoras de robustez de la API detectadas por los tests. Crear un registro desde el CRUD sin un campo obligatorio da 500 en vez de 400, y corregir sin enviar `nivel_autonomia` da 400. La web siempre envía todos los campos, así que no afectan al uso normal.
