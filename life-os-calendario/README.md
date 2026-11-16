# Life OS — Centro de mando personal

Web app privada (móvil y PC, instalable) con 5 secciones: **Compras · Tareas · Rutas · Horario · Clase**.
Los datos viven en Google (Sheets, Tasks, Calendar); la interfaz se aloja en Easypanel.
Clase es el mapa del curso de Python: su contenido está en la constante `CLASE` de `public/index.html`
y el progreso se guarda en la pestaña `Clase` de la hoja, que Apps Script crea sola. Si el script aún no tiene
`obtenerClase`, la app guarda en el navegador y sube lo marcado en cuanto se actualice. Una entrega o prueba
añadida a Tareas queda enlazada por su título: completarla en Tareas o Google Tasks la marca también en Clase.
Horario es un calendario con vistas Mes, Semana, Día y Lista; descarga con `obtenerEventos` los eventos del rango que se está viendo.

```
Navegador (móvil / PC)
   │  contraseña + cookie de sesión
   ▼
server.js  (Easypanel · paginas_sencillas/life-os)
   │  POST { token, fn, args }   ← el token nunca llega al navegador
   ▼
Google Apps Script  (apps-script/Api.gs + Codigo.gs, ligado a la hoja)
   ├── Google Sheets  "Mi_Centro_De_Mando"  (pestañas Compras, Tareas, Rutas y Clase)
   ├── Google Calendar (calendario principal)
   └── Google Tasks   (sincronización bidireccional, activador cada 5 min)
```

```
├── server.js                 # Servidor Node sin dependencias: login, estáticos y proxy /api
├── public/                   # Interfaz (index.html), login, manifest, service worker, iconos
├── apps-script/              # Código para pegar en Extensiones > Apps Script de la hoja
│   ├── Codigo.gs             #   Sincronización Sheets <-> Google Tasks + activadores
│   ├── Api.gs                #   API privada (doPost) que usa server.js
│   └── appsscript.json       #   Manifiesto (Tasks API, zona horaria)
├── Dockerfile                # Imagen para Easypanel
├── datos/  tools/            # Copia de la hoja de ejemplo y su generador
└── brief.txt                 # Brief original
```

Hoja de datos: https://docs.google.com/spreadsheets/d/1uU8_e7P2qwpQLlVBfSE4etxrUvvTlJlZTXQqf3o9WU0/edit

## Variables de entorno (Easypanel)

| Variable | Qué es |
|---|---|
| `APP_PASSWORD` | Contraseña para entrar en la app |
| `SESSION_SECRET` | Secreto aleatorio (≥ 32 caracteres) para firmar la sesión |
| `APPS_SCRIPT_URL` | URL `/exec` de la implementación de Apps Script |
| `APPS_SCRIPT_TOKEN` | Igual que la propiedad `API_TOKEN` del script |

La sesión dura 180 días. Cerrar sesión: barra lateral en PC.

## Configurar Google Apps Script

1. Hoja → **Extensiones → Apps Script** → pega `apps-script/TodoEnUno.gs` entero en `Código.gs`
   (es `Codigo.gs` + `Api.gs` juntos; regenerarlo si cambias alguno de los dos).
   Si el manifiesto no tiene el servicio Tasks, usa `apps-script/appsscript.json`.
2. ⚙️ **Configuración del proyecto → Propiedades de la secuencia de comandos → Añadir**:
   `API_TOKEN` = el mismo valor que `APPS_SCRIPT_TOKEN`.
3. Si aún no lo hiciste: ejecuta `instalarActivadores` una vez.
4. **Implementar → Nueva implementación → Aplicación web**: Ejecutar como **Yo**,
   Quién tiene acceso **Cualquier usuario** → Implementar → copia la URL `/exec`.
   *Por qué "Cualquier usuario": el servidor de Easypanel no puede iniciar sesión con tu cuenta de Google.
   Sin el token secreto, la API responde "No autorizado" y no expone nada.*
5. Comprobación: abrir la URL `/exec` en el navegador muestra `{"ok":true,...}`.

**Si cambias el código de Apps Script:** Implementar → Gestionar implementaciones → ✏️ → Versión: *Nueva versión*
(así la URL no cambia).

## Desarrollo local

```bash
npm run demo        # http://localhost:3000  · contraseña: demo · datos en memoria
```
Abrir `public/index.html` directamente en el navegador muestra la interfaz con datos de ejemplo.

## Instalar en el dispositivo
- **Android (Chrome):** abre la web → ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** compartir → *Añadir a pantalla de inicio*.
- **PC (Chrome/Edge):** icono de instalar en la barra de direcciones.

## Notas
- Direcciones como `"Lidl, Ceuta"` o la calle exacta para que el mapa las ubique.
- No renombres ni reordenes las columnas de la hoja; el código las busca por nombre, así que añadir columnas nuevas al final es seguro.
- Despliegue: tras `git push` a `main`, pulsar **Deploy** en Easypanel (`paginas_sencillas` → `life-os`);
  el auto-deploy no se dispara solo en este repo.
- Si el Horario da error de permisos de Calendar: quitar el acceso del proyecto en
  https://myaccount.google.com/connections y volver a ejecutar `sincronizarTodo` marcando **todas** las casillas.
