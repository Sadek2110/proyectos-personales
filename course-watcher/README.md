# Course Watcher

Demonio ligero en Node.js $\ge 22$ que vigila Moodle Centros Málaga, Aula Virtual FP Ceuta y Google Classroom, sincroniza materiales nuevos en Google Drive, genera resúmenes con IA (Gemini) y envía lotes idempotentes a `POST /api/ingesta/clase` en **Life OS**.

## Variables de Entorno (`.env`)

Consulta [`.env.example`](file:///c:/Users/sadek/Desktop/Proyectos/watcher-lifeOS/course-watcher/.env.example) para la lista completa:

- `LIFEOS_URL`: URL base de Life OS (p. ej. `http://life-os:3000` en la red interna de EasyPanel).
- `INGESTA_TOKEN`: Token secreto compartido con Life OS (`Authorization: Bearer <INGESTA_TOKEN>`).
- `MOODLE_URL`, `MOODLE_USER`, `MOODLE_PASS`, `MOODLE_TOKEN`: Credenciales de Moodle Centros Málaga (Python).
- `CIBER_URL`, `CIBER_USER`, `CIBER_PASS`, `CIBER_TOKEN`: Credenciales de Aula Virtual FP Ceuta (Ciberseguridad).
- `DRIVE_WEBHOOK_URL`, `DRIVE_WEBHOOK_TOKEN`, `DRIVE_ROOT_FOLDER_ID`: Sincronización opcional de PDFs/Notebooks/ZIPs a Google Drive.
- `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.8-flash`), `GEMINI_MODEL_RESERVA` (`gemini-3.5-flash-lite`): Resúmenes IA opcionales para temas nuevos.
- `CRON_HORARIO` (`08:00-22:00`), `CRON_INTERVALO_MIN` (`120`), `PORT` (`3001`), `DATA_DIR` (`/data`).

## Comandos

```bash
# Ejecutar todos los tests (33 tests)
npm test

# Arrancar el demonio y servidor HTTP (/healthz y /ejecutar)
npm start

# Ejecutar una pasada en modo simulacro (dry-run, sin enviar a Life OS ni alterar estado)
npm run dry-run
```
