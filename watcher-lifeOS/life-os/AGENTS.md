# Reglas de Proyecto — Life OS (`Sadek2110/life-os`)

1. **Rama y PR obligatorias**: Cualquier cambio en este repositorio debe hacerse en una rama dedicada (`feat/fase-1-temario-api`, `feat/fase-4-avisos-novedad`, etc.) y proponerse mediante Pull Request. Nunca hacer push directo a `main`.
2. **Compatibilidad e Idempotencia**:
   - `src/clase.mjs` se mantiene como semilla inicial y fallback en caso de que `/data/temario.json` aún no exista.
   - Los 61 tests existentes (`npm test`) deben seguir pasando siempre sin regresiones.
   - Toda modificación en `server.js`, `agente/herramientas.js` o `agente/planificador.js` debe respetar el estilo sin dependencias externas y en español.
3. **Preservación de progreso y campos manuales**:
   - La ingesta en `/api/ingesta/clase` exige `Authorization: Bearer <INGESTA_TOKEN>` comparado con `crypto.timingSafeEqual` (`igual()`).
   - Nunca sobrescribir `nota`, `ahora`, `color`, `meta`, `corto` ni `alerta` al actualizar el temario desde el watcher.
