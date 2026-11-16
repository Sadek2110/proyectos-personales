# GLOVI · MVP funcional

Aplicación del piloto de Ceuta construida a partir de los tres dosieres del proyecto. La interfaz sigue un sistema de diseño editorial propio (tipografía Fraunces autoalojada, paleta papel/tinta/terracota, RTL incluido) definido en `src/style.css`.

## Arranque

Requiere **Node.js 24 o posterior** y npm. No requiere Python ni una cuenta de proveedor para explorar la guía local.

```bash
npm ci
npm run setup
npm run build
npm start
```

Abrir **http://127.0.0.1:3200**. Panel de operación: **http://127.0.0.1:3200/admin**. El token se genera en `.env`, variable `ADMIN_TOKEN`; copiarlo en el formulario del panel. No está en el código ni se imprime en los registros. `setup` nunca sobrescribe una configuración existente.

Los datos persisten en `data/glovi.sqlite`. El primer arranque crea dos servicios **DEMO** y turnos para los próximos siete días. Pasado ese plazo, el operador puede crear nuevos turnos desde el panel. No se regeneran turnos ni reservas al reiniciar.

Para desarrollar: `npm run dev` en una terminal y `npm run dev:web` en otra; abrir la dirección que muestra Vite. La API se sirve en el puerto 3200 y Vite la reenvía. Si cambia el puerto de la API, actualizar también `vite.config.ts` y reiniciar Vite.

## Desplegar en Easypanel desde GitHub

1. Crear un servicio **App**. En **Source**, elegir **GitHub**, conectar el repositorio privado `Sadek2110/Glovi`, rama `main` y **Build Path** `/`.
2. En **Build**, elegir **Dockerfile** y dejar la ruta `Dockerfile`. No elegir la fuente «Dockerfile» independiente: esa opción no trae los archivos del repositorio.
3. En **Storage**, añadir un **Volume** montado en `/app/data`. La base SQLite y sus archivos WAL quedan ahí entre despliegues. Mantener **una sola réplica**.
4. En **Environment**, configurar `ADMIN_TOKEN` con un valor aleatorio largo (por ejemplo, generado con `openssl rand -hex 32`), `PUBLIC_ORIGIN=https://tu-dominio` y `COOKIE_SECURE=true`. El contenedor ya define `HOST=0.0.0.0`, `PORT=3200` y `DATABASE_PATH=/app/data/glovi.sqlite`. `GEMINI_API_KEY` y `GEMINI_MODEL` son opcionales.
5. En **Domains**, usar HTTPS y el **target port 3200**. El valor de `PUBLIC_ORIGIN` debe ser exactamente el origen público, sin barra final. Guardar y pulsar **Deploy**. Comprobar `https://tu-dominio/api/status` y abrir `/admin` para introducir el token.

No subir `.env` ni `data/` a GitHub. Si se usa el widget en otros sitios, añadir sus orígenes HTTPS a `EMBED_ORIGINS`, separados por espacios, y volver a desplegar. Habilitar las copias del volumen desde **Storage** tras verificar el primer despliegue.

## Funciones entregadas

1. Sesión anónima, idioma ES/EN/FR/AR e intereses persistentes.
2. Asistente con historial, contexto cultural con fuentes y adaptador Gemini. Guía local identificada cuando no se configura IA; respuesta de respaldo ante fallo.
3. Ruta por tres paradas de Ceuta, narraciones localizadas y detalle según intereses.
4. GPS consentido, detección a 100 m, precisión mínima, visitas sin duplicados, progreso y lectura por voz disponible en el navegador.
5. Emergencias públicas: 112, hospital, policía y directorio consular; navegación mediante Google Maps.
6. Solicitudes de reserva con turnos, capacidad transaccional, idempotencia, consulta y cancelación.
7. Operación autenticada: crear servicios y turnos, confirmar o rechazar solicitudes.
8. Consentimientos revocables, exportación y borrado de datos; no se guarda el GPS.
9. Widget insertable y ejemplo de integración.
10. Estado explícito de IA, reservas internas y eSIM fuera de servicio en este piloto.

La lista con procedencia, reglas y aceptación está en [REQUISITOS-MVP.md](docs/REQUISITOS-MVP.md). Las evidencias del bucle especificación → prueba → implementación → regresión están en [SDD.md](docs/SDD.md).

## Probar

```bash
npx playwright install chromium
npm run check
```

`check` ejecuta pruebas de API/dominio/proveedor, comprobación de tipos, build y recorridos en Chromium. Las pruebas de API usan bases temporales; las de navegador una base en memoria y el puerto 3100. No cambian los datos de la aplicación ni llaman a Gemini. En una máquina Linux sin bibliotecas de navegador, `npx playwright install --with-deps chromium` instala también las dependencias del sistema.

Comandos separados: `npm test`, `npm run build`, `npm run test:e2e`. Si se cambia la interfaz, reconstruir antes de ejecutar únicamente `test:e2e`.

## Activar Gemini

En `.env`, configurar `GEMINI_API_KEY` y `GEMINI_MODEL` con una clave y un modelo habilitado en la cuenta. Reiniciar el servidor. El visitante debe marcar su consentimiento antes de enviar consultas a Gemini. La clave permanece en el backend. Consultar el [contrato oficial generateContent](https://ai.google.dev/api/generate-content) al elegir el modelo: el nombre mencionado en el dosier no se da por disponible.

Se envían pregunta, idioma, intereses, catálogo e historial reciente. No se adjuntan datos de reservas ni coordenadas. Tiempo máximo de espera: ocho segundos. Las respuestas de emergencias, reservas, gastronomía sin datos verificados y eSIM son deterministas; las consultas generales de visitas usan Gemini cuando está habilitado. El proveedor no ejecuta transacciones. Sin credenciales, la guía local no comprende preguntas arbitrarias como un modelo generativo.

## Integrar el widget

Ejemplo local: **http://127.0.0.1:3200/embed-example.html**.

```html
<script src="https://glovi.example/widget.js" data-height="720" defer></script>
```

En despliegue HTTPS, configurar `PUBLIC_ORIGIN=https://glovi.example`, `COOKIE_SECURE=true` y `EMBED_ORIGINS=https://hotel.example https://municipio.example`. El widget usa iframe; la CSP solo permite los orígenes declarados. Las cookies seguras son particionadas con SameSite=None para admitir un contexto integrado compatible. Cada sitio anfitrión tiene su propia sesión; no se comparte identidad entre hoteles. Si el navegador bloquea las cookies necesarias, el enlace «Abrir GLOVI» permite usarlo en una ventana. El anfitrión también debe permitir geolocalización en su propia política de permisos. El GPS requiere HTTPS o localhost.

## Límites del piloto y preparación de producción

- **Reservas:** flujo interno real y persistente; los dos servicios iniciales son ficticios y están señalados DEMO. Para un piloto comercial hay que incorporar al operador y su inventario. No hay pago, correo de confirmación ni sincronización con sistemas externos. La confirmación se consulta en la app.
- **Navegación:** se delega a Google Maps mediante sus [URLs oficiales](https://developers.google.com/maps/documentation/urls/get-started), sin clave. No se calculan trayectos ni tiempos de llegada en el servidor. Se abre Maps para las indicaciones paso a paso; no hay mapa embebido en esta versión.
- **GPS y audio:** validar las coordenadas del catálogo sobre el terreno antes de uso público. La web debe permanecer abierta; no hay seguimiento en segundo plano. Las voces dependen del sistema/navegador; siempre queda disponible el texto.
- **IA:** contrato verificado con respuestas controladas; falta una prueba en vivo con las credenciales del proyecto. No se garantiza veracidad de texto generado.
- **eSIM, cobros, premium, app nativa, Antigravity y expansión multiempresa:** pendientes según el alcance documentado. No se presentan como integraciones operativas.
- **Seguridad/operación:** la base local no está cifrada. Para producción hacen falta HTTPS con proxy, volumen cifrado, copias protegidas, gestión de secretos, retención y revisión de datos/proveedores. El borrado es lógico en la base activa; no elimina copias históricas del operador. No se afirma cumplimiento RGPD ni cifrado extremo a extremo a partir de estas pruebas.
- **Escala:** una instancia de Node y SQLite local. El límite de peticiones está en memoria y ve la IP de la conexión directa; detrás de proxy aplicar también los límites por cliente en el proxy. Para varias instancias migrar a PostgreSQL y límites compartidos. No hay SLA de operación 24/7.

Las fuentes del directorio y del contenido están en [FUENTES.md](docs/FUENTES.md), y los endpoints en [API.md](docs/API.md).
