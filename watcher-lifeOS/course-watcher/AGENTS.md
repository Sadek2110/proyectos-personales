# Reglas de Proyecto — Course Watcher (`course-watcher/`)

1. **Propósito**: Servicio ligero en Node.js $\ge 22$ que consulta periódicamente las fuentes académicas (Moodle Centros, Google Classroom y plataforma de Ciberseguridad), normaliza los contenidos al modelo `Item`, calcula el diff frente al último estado y envía los cambios a `POST /api/ingesta/clase` de Life OS.
2. **Cero dependencias innecesarias**:
   - Usar `fetch` nativo, `node:crypto`, `node:fs`, `node:test` y `node:assert/strict`.
   - Solo usar `@google/genai` o `playwright` en las fases donde esté justificado por la spec.
3. **Respeto estricto a las plataformas**:
   - Reutilizar siempre el token (`wstoken` de Moodle guardado en `/data/watcher-estado.json`).
   - Consultas siempre secuenciales, nunca en paralelo.
   - Si aparece CAPTCHA o 2FA, abortar la fuente, registrar el estado de error y notificar sin reintentar en bucle.
4. **Tests y Fixtures**:
   - Los tests automáticos (`npm test`) **nunca** hacen peticiones de red reales; usan exclusivamente fixtures anonimizadas en `test/fixtures/`.
   - El smoke test real se ejecuta manualmente con `npm run smoke` (o `scripts/descubrimiento-moodle.js`) fuera de CI.
