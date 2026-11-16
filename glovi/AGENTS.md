# AGENTS.md

## Proyecto

GLOVI: piloto web turístico de Ceuta. SPA React 19 + API Express 5 + SQLite (`node:sqlite`) en una sola instancia Node, sin servicios externos obligatorios. La documentación, la UI y los textos de usuario están en español: mantener ese idioma al editarlos.

## Comandos

- `npm run setup` — crea `.env` con `ADMIN_TOKEN` aleatorio; nunca sobrescribe uno existente.
- Desarrollo en dos terminales: `npm run dev` (API en :3200, tsx --watch) y `npm run dev:web` (Vite reenvía `/api` a :3200). Si cambia el puerto de la API, actualizar también `vite.config.ts`.
- `npm run build` = `tsc --noEmit && vite build`. La comprobación de tipos va dentro del build; no hay lint ni formatter configurados.
- `npm start` — sirve API y `dist/` en :3200.
- `npm test` — solo pruebas de API/dominio (`tests/*.test.ts`, node:test vía tsx, concurrencia 1). No incluye e2e.
- `npm run test:e2e` — Playwright levanta `npm start` en :3100 con SQLite en memoria y sirve `dist/`: ejecutar `npm run build` antes si cambió la interfaz.
- `npm run check` — puerta completa: test → build → test:e2e.
- Una prueba: `npx tsx --test --test-name-pattern="F01" tests/api.test.ts`. Un e2e: `npx playwright test -g "texto"`.
- Primera vez: `npx playwright install chromium` (`--with-deps` en Linux sin bibliotecas de navegador).

## Arquitectura

- `server/index.ts` — entrada: lee env y llama a `createApp`.
- `server/app.ts` — toda la API (rutas, seguridad, CSP, rate limit). Exporta `createApp(options)`: las pruebas la instancian con SQLite temporal, sin proceso aparte.
- `server/store.ts` — esquema SQLite (WAL) y semilla: solo si `services` está vacía (2 servicios DEMO + turnos para 7 días). No resembrar al reiniciar.
- `server/assistant.ts` — intents deterministas; `geminiProvider` acepta `transport` inyectable para probar el contrato HTTP sin credenciales.
- `server/catalog.ts` — POIs, ruta y narraciones ES/EN/FR/AR con fuentes.
- `src/main.tsx` — toda la SPA; `src/i18n.ts` textos; `src/api.ts` cliente fetch. `public/widget.js` — script insertable (iframe a `/widget`); panel de operación en `/admin`.
- Referencias: endpoints y reglas en `docs/API.md`; requisitos F01–F10 en `docs/REQUISITOS-MVP.md`; evidencias de pruebas en `docs/SDD.md`.

## Convenciones

- Imports con extensión `.ts` explícita (`from './app.ts'`): `allowImportingTsExtensions` activo y tsx ejecuta el servidor sin compilar.
- Zod v4: usar `z.email()`, `z.iso.datetime()`; no las formas de v3 (`z.string().email()`).
- Flujo SDD documentado: especificar → prueba en rojo → implementar → regresión → registrar en `docs/SDD.md`. Las pruebas se nombran con el ID de requisito (`F01`…`F10`).
- `.env` se carga con el flag de Node `--env-file-if-exists`, no con dotenv.
- Requiere Node ≥ 24 (`node:sqlite`, flag de env). `.venv/` es residual: el proyecto no usa Python.
- Estilo compacto sin espacios sobrantes en `server/` y `src/`; no reformatear archivos completos.
- Las pruebas nunca llaman a Gemini ni tocan `data/glovi.sqlite` (usan bases temporales o `:memory:`).

## Reglas de dominio que no deben romperse

- Emergencias, reservas, gastronomía y eSIM tienen respuestas deterministas; Gemini solo atiende el intent `visit` y solo con `aiConsent`.
- No almacenar coordenadas GPS: `POST /location` solo calcula llegadas (umbral 100 m, precisión ≤ 100 m).
- Reservas: aforo dentro de transacción `BEGIN IMMEDIATE`; idempotencia por `(session_id, idempotency_key)` + fingerprint (mismo contenido → 200, distinto → 409).
- CSP estricta en `app.ts` (`script-src 'self'`): nada de scripts inline; los orígenes del widget se declaran en `EMBED_ORIGINS` y salen en `frame-ancestors`.
- Historial de chat acotado a 40 mensajes; una consulta de IA simultánea por sesión (409 `chat_busy`).
