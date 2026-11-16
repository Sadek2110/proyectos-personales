# Especificación Fase 0 — Descubrimiento y Entorno Local

## 1. Objetivo
Preparar el entorno local de trabajo, configurar las reglas de agentes (`AGENTS.md`) y skills del workspace (`.agents/skills/`), verificar la batería de pruebas de `life-os`, probar la extracción de token y funciones de la API de Moodle Centros sin código de producción, almacenar fixtures anonimizadas y entregar `docs/roadmap.md`.

## 2. Entregables y Criterios de Aceptación
- **CA-0.1**: Repositorio `life-os` clonado en local con todas sus dependencias y sus 61 tests pasando en verde (`node --test`).
- **CA-0.2**: `AGENTS.md` y `.agents/skills/` configurados con las reglas de SDD+TDD, seguridad de credenciales y orquestación multi-agente.
- **CA-0.3**: Autenticación contra Moodle Centros probada y documentada (descubierto flujo SSO CAS $\rightarrow$ `admin/tool/mobile/launch.php` $\rightarrow$ `wstoken` de 32 caracteres) y listado de funciones WS verificado.
- **CA-0.4**: Fixtures reales y anonimizadas guardadas en `course-watcher/test/fixtures/` con test automático (`course-watcher/test/fixtures.test.js`) que garantiza la ausencia de credenciales o DNI.
- **CA-0.5**: `docs/roadmap.md`, `docs/architecture.md` y `docs/CHANGELOG.md` redactados y listos para revisión del usuario.
