---
name: multi-agent-orchestrator
description: >-
  Guía y plantillas para orquestar subagentes con run_workflow y swarm durante
  la ejecución con /goal. Úsala cuando vayas a paralelizar specs, tests,
  implementación de conectores o verificación cruzada entre agentes.
---

# Orquestación de Agentes (`run_workflow` y `swarm`)

Cuando ejecutes fases del proyecto bajo `/goal`, utiliza la orquestación de agentes siguiendo estas reglas para maximizar velocidad sin colisiones de archivos.

## 1. Cuándo usar cada herramienta

- **`invoke_subagent` (`research` / `self` / `browser`)**:
  - Para una única tarea delegada (ej. explorar un endpoint, probar un flujo en navegador o auditar un módulo).
- **`run_workflow` (Script Python de orquestación)**:
  - Ideal para **pipelines por fases** (`phase("Spec") -> phase("Tests") -> phase("Implement") -> phase("Verify")`) y **fan-out paralelo** (`parallel()`) sobre archivos o conectores disjuntos.
- **`swarm` (Tablero compartido multi-agente)**:
  - Ideal cuando varios agentes de larga duración (`lifeos-author`, `watcher-author`, `verifier`) necesitan coordinarse e iterar con revisiones cruzadas.

## 2. Plantilla de Pipeline SDD+TDD para `run_workflow`

Guarda tus scripts de workflow en el directorio `scratch/` de la conversación o ejecuta inline con `run_workflow`:

```python
phase("1. Tests de Aceptación (TDD)")
test_result = await agent(
    """Lee AGENTS.md y docs/specs/fase-N.md.
    Escribe los tests de aceptación en test/ cubriendo todos los criterios CA-N.x.
    Usa únicamente node:test y node:assert/strict. No modifiques el código de producción aún.""",
    schema={"type": "object", "properties": {"test_files": {"type": "array", "items": {"type": "string"}}, "summary": {"type": "string"}}, "required": ["test_files", "summary"]},
    role="Test Author",
)
log("Tests creados:", test_result["summary"])

phase("2. Implementación")
impl_result = await agent(
    f"""Lee AGENTS.md y docs/specs/fase-N.md.
    Implementa el código necesario para que pasen los tests en {test_result['test_files']}.
    Ejecuta npm test hasta que toda la suite esté 100% en verde.""",
    schema={"type": "object", "properties": {"passed": {"type": "boolean"}, "files_modified": {"type": "array", "items": {"type": "string"}}, "test_output": {"type": "string"}}, "required": ["passed", "files_modified", "test_output"]},
    role="Implementation Author",
)
log("Resultado implementación:", impl_result["test_output"])

phase("3. Verificación y Auditoría")
verify_result = await agent(
    """Actúa como verificador independiente.
    1. Ejecuta npm test en life-os y course-watcher.
    2. Comprueba cada criterio CA-N.x de docs/specs/fase-N.md.
    3. Verifica con git status / git diff que no haya credenciales expuestas ni campos manuales sobrescritos.""",
    schema={"type": "object", "properties": {"approved": {"type": "boolean"}, "issues": {"type": "array", "items": {"type": "string"}}}, "required": ["approved", "issues"]},
    role="Independent Verifier",
)
log("Verificación:", verify_result)
```

## 3. Reglas de Particionado Sin Colisiones

Si lanzas `parallel()` en `run_workflow` o múltiples workers en `swarm`:
1. **Nunca asignes el mismo archivo a dos agentes a la vez**.
2. Ejemplo de partición limpia en Fase 2/3:
   - Agente A: `course-watcher/src/fuentes/moodle.js` + `course-watcher/test/moodle.test.js`
   - Agente B: `course-watcher/src/diff.js` + `course-watcher/test/diff.test.js`
   - Agente C (`verifier`, tras A y B): integra en `course-watcher/src/index.js` y ejecuta toda la suite.
