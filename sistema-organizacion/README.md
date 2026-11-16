# Life OS — Centro de mando personal

Web app privada (móvil y PC, instalable) con 6 secciones: **Compras · Tareas · Rutas · Horario · Clase · Agente**.
Los datos viven en Google (Sheets, Tasks, Calendar); la interfaz se aloja en Easypanel.
Clase es el mapa del curso de Python: su contenido está en la constante `CLASE` de `src/clase.mjs`
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
├── server.js                 # Servidor Node: login, estáticos (dist/) y proxy /api
├── agente/                   # Agente con Gemini, avisos y MCP (ver "Agente")
├── demo.js                   # Datos y modelo de ejemplo para DEMO=true
├── test/                     # Pruebas: npm test
├── index.html, vite.config.mjs
├── src/                      # Interfaz en React (se compila a dist/ con Vite)
│   ├── api.js, datos.js      #   Caché, lecturas por sección y escrituras optimistas
│   ├── clase.mjs             #   Contenido del curso (también lo lee el servidor)
│   ├── componentes/  vistas/
│   └── estilos.css           #   Colores de cada línea y tipografía
├── public/                   # Se copia tal cual: login, manifest, service worker, iconos, fuentes
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
| `GEMINI_API_KEY` | Clave de Google AI Studio. Sin ella el chat no responde y el resumen es una lista simple |
| `GEMINI_MODEL`, `GEMINI_MODEL_RESERVA` | Opcionales. Por defecto `gemini-3.8-flash` y, si se queda sin cuota, `gemini-3.5-flash-lite` |

La sesión dura 180 días. Cerrar sesión: barra lateral en PC.

El servicio necesita un **volumen montado en `/data`**: guarda la conversación, las suscripciones, los avisos ya enviados
y las claves de avisos y MCP, que se generan solas en el primer arranque. Sin volumen, cada despliegue obliga a reactivar los avisos en cada dispositivo.

## Agente

```
App (pestaña Agente) ─┐
Cliente MCP ──────────┼─► agente/herramientas.js ─► Apps Script
Gemini ───────────────┘
agente/planificador.js ─► reglas sin LLM + resumen y sugerencias con Gemini ─► Web Push
```

- **Permisos:** crea y edita directamente. Para borrar, la app muestra una tarjeta y solo la pulsación ejecuta la acción.
- **Avisos:** se activan en cada dispositivo desde Agente → Ajustes. En iPhone hay que instalar antes la app en la pantalla de inicio.
  Los datos se refrescan cada 15 min, así que un evento recién creado puede no avisar a tiempo.
- **Sin cuota de Gemini:** los avisos de eventos, tareas y entregas no usan el modelo y el resumen pasa a ser una lista simple.
- **Voz:** el micrófono graba hasta 2 min y Gemini lo transcribe (gasta cuota; el audio no se guarda). El texto queda en el cuadro para revisarlo antes de enviarlo.
  "Escuchar" lee cada respuesta con las voces del dispositivo, sin gastar cuota ni enviar nada.
- **Límites:** los eventos no se pueden editar (solo crear y borrar) y los repetidos se borran desde Google Calendar.

**MCP:** `https://lifeos.dksaa.com/mcp`, con el token de Agente → Ajustes → Conexión MCP en la cabecera `Authorization: Bearer`.
Es apto para clientes como Claude Code; los conectores de claude.ai suelen exigir OAuth, que no está implementado.
Los borrados van marcados como destructivos, pero **la confirmación depende del cliente**, no de Life OS.

**Condiciones de la clave gratuita (leídas el 2026-11-04):** en el EEE, Suiza y Reino Unido se aplican también a la cuota gratuita las
condiciones de datos de pago, pero las mismas condiciones exigen servicios de pago al poner clientes de la API a disposición de usuarios en esas regiones.
Activar la facturación en AI Studio no requiere cambiar código.

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
npm install
npm run demo        # compila y sirve en http://localhost:3000, contraseña: demo, datos en memoria
```
Para ver los cambios al guardar: `npm run demo:api` en una terminal y `npm run dev` en otra (http://localhost:5173).
Sin clave, el modo demo usa un modelo simulado que entiende "crea", "borra" y "fallo". Los avisos solo funcionan con `npm run demo`, no con `npm run dev`.

## Cómo cargan los datos
Cada sección pide solo lo suyo y lo pinta en cuanto llega, sin esperar a las demás. Si Google falla en una, el error se queda ahí.
Los datos se guardan en el navegador durante 7 días para abrir al instante y se actualizan por detrás; cerrar sesión los borra.
El service worker hace lo mismo con la interfaz, así que una versión nueva se ve en la segunda apertura tras desplegar.

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
