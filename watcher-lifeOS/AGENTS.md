# AGENTS.md — Reglas y Orquestación del Proyecto Course Watcher + Life OS

Este espacio de trabajo gestiona el desarrollo de **Course Watcher** (`course-watcher/`) y las mejoras asociadas en **Life OS** (`life-os/`), siguiendo el [Brief v2 — Course Watcher (revisado)](https://app.notion.com/p/Brief-v2-Course-Watcher-revisado-418f359bbd5a815fb68cefa9f62b78c3).

---

## 1. Principios de Trabajo: SDD + TDD + Puertas de Aprobación

1. **Prohibido escribir código de producción sin hoja de ruta aprobada**:
   - No escribir código de producción antes de que el usuario apruebe explícitamente `docs/roadmap.md` tras la Fase 0.
2. **Ciclo estricto por Fase (SDD + TDD)**:
   - Cada fase se desarrolla de una en una siguiendo la secuencia obligatoria:
     `docs/specs/fase-N.md` (Spec) $\rightarrow$ Tests de aceptación (`node --test`) $\rightarrow$ Código mínimo $\rightarrow$ Suite 100% en verde $\rightarrow$ Actualizar `docs/CHANGELOG.md` y Notion $\rightarrow$ Pedir confirmación al usuario antes de pasar a la fase siguiente.
3. **Flujo Git en `life-os`**:
   - Nunca hacer push directo a `main` ni tocar producción en EasyPanel sin pasar por rama (`feat/fase-N-...`) + Pull Request.
   - El merge de la PR lo aprueba el usuario (y dispara el despliegue en EasyPanel).

---

## 2. Convenciones de Código y Arquitectura

- **Idioma**: Código, identificadores, mensajes de error, tests y comentarios **en español**, manteniendo el estilo exacto de `life-os` (`crearAlmacen`, `llamarGoogle`, `evaluar`, `hechoItem`, etc.).
- **Stack y Runtime**:
  - Node.js $\ge 22$ (CommonJS `'use strict'` en servidor/watcher o ESM `.mjs` donde comparta módulo con frontend como `src/clase.mjs`).
  - Cero frameworks web pesados (usar `node:http`, `node:crypto`, `node:fs`, `fetch` nativo).
  - Tests con el runner nativo `node --test` y `node:assert/strict`.
  - **Sin dependencias nuevas** sin justificación explícita aprobada en la spec.
- **Protección de Datos Manuales (`clase.mjs` / `/data/temario.json`)**:
  - El watcher **jamás** pisa campos manuales de los items ni de los módulos: `nota`, `ahora`, `color`, `meta`, `corto`, `alerta`.
  - La ingesta (`POST /api/ingesta/clase`) hace *upsert* por `ext_id`, preserva campos manuales, archiva (no borra) lo que desaparece de la plataforma y es estrictamente **idempotente** (segunda pasada con el mismo lote = `{ nuevos: 0, cambiados: 0, archivados: 0 }`).
  - Migración sin pérdida: los IDs antiguos (`modulo/unidad/nombre`) se mapean a `ext_id` conservando todo lo marcado como hecho en la hoja `Clase`.

---

## 3. Seguridad y Respeto a las Plataformas

- **Secretos y Credenciales**:
  - **NUNCA** imprimir en consola, guardar en logs, incluir en prompts de subagentes, guardar en fixtures ni hacer commit de contraseñas o tokens (`MOODLE_USER`, `MOODLE_PASS`, `CIBER_USER`, `CIBER_PASS`, `INGESTA_TOKEN`, `GEMINI_API_KEY`, `APPS_SCRIPT_TOKEN`).
  - Todas las fixtures en `course-watcher/test/fixtures/` deben estar **anonimizadas** (reemplazar tokens reales, correos personales, DNI o nombres de compañeros por valores ficticios).
- **Acceso a Moodle / Classroom / Plataformas**:
  - Una sola sesión por fuente; reutilizar siempre el `wstoken` de Moodle o cookies de sesión persistidas en `/data`.
  - **Prohibidas las ejecuciones en paralelo contra las plataformas** (los subagentes trabajan contra fixtures locales; solo 1 smoke test real secuencial por fase fuera de CI).
  - **Ante un CAPTCHA, Turnstile o 2FA**: detener inmediatamente la ejecución y avisar al usuario. Nunca intentar resolverlo ni saltarlo.

---

## 4. Orquestación de Agentes (`/goal`, `run_workflow` y `swarm`)

Para maximizar la velocidad, calidad y aislamiento cuando se trabaje con `/goal` o enjambres de agentes:

1. **Aislamiento de tareas por agente**:
   - Un agente por archivo o módulo independiente (`workspace: "share"` o `"branch"` cuando editen en paralelo). Dos agentes nunca editan el mismo archivo simultáneamente.
2. **Roles recomendados en la orquestación**:
   - `spec-architect`: Redacta o refina `docs/specs/fase-N.md` y diseña contratos JSON / esquemas.
   - `test-author`: Escribe los tests de aceptación en `test/*.test.js` usando fixtures antes de implementar.
   - `lifeos-author`: Implementa cambios en `life-os/` (endpoints, `temario.json`, vista React, planificador).
   - `watcher-author`: Implementa conectores (`MoodleApiSource`, `ClassroomSource`), normalizador y motor de diff en `course-watcher/`.
   - `verifier`: Ejecuta `npm test`, comprueba cobertura de criterios de aceptación, verifica que ningún campo manual se pierda y audita que no haya secretos expuestos.
3. **Skills del Workspace (`.agents/skills/`)**:
   - Antes de abordar una tarea específica, los agentes deben consultar las skills locales en `.agents/skills/`:
     - `sdd-tdd-workflow`: Flujo paso a paso para cada fase, estructura de specs y checklist de validación.
     - `moodle-connector`: Uso de la API móvil de Moodle Centros (`core_course_get_contents`, `mod_assign_get_assignments`, `core_course_get_updates_since`, `gradereport_user_get_grade_items`) y normalización a `Item`.
     - `lifeos-temario-ingesta`: Contrato de `/data/temario.json`, algoritmo de migración de IDs (`modulo/unidad/nombre` $\leftrightarrow$ `ext_id`) e ingesta idempotente en `life-os`.
     - `multi-agent-orchestrator`: Plantillas para lanzar pipelines con `run_workflow` o `swarm` en cada fase del roadmap.

---

## 5. Estructura del Workspace

```text
watcher-lifeOS/
├── AGENTS.md                        # Este archivo de reglas globales del workspace
├── .agents/
│   └── skills/                      # Skills especializadas para los agentes del proyecto
│       ├── sdd-tdd-workflow/
│       ├── moodle-connector/
│       ├── lifeos-temario-ingesta/
│       └── multi-agent-orchestrator/
├── docs/                            # Documentación viva y Especificaciones (SDD)
│   ├── architecture.md              # Arquitectura detallada, modelo de datos y flujos
│   ├── roadmap.md                   # Hoja de ruta por fases y estado de Fase 0
│   ├── CHANGELOG.md                 # Registro de cambios por fase
│   └── specs/                       # Especificaciones detalladas por fase (fase-0.md .. fase-8.md)
├── course-watcher/                  # Servicio Course Watcher (Node 22, contenedor independiente)
│   ├── package.json
│   ├── Dockerfile
│   ├── .env.example
│   ├── src/
│   ├── scripts/                     # Scripts de descubrimiento (Fase 0) y utilidades
│   └── test/
│       └── fixtures/                # Respuestas de API anonimizadas para TDD
└── life-os/                         # Clon local del repo Sadek2110/life-os (61/61 tests en verde)
```
