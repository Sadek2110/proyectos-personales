---
name: sdd-tdd-workflow
description: >-
  Flujo de trabajo Spec-Driven Development (SDD) y Test-Driven Development (TDD)
  para Course Watcher y Life OS. Úsala al iniciar, implementar o verificar
  cualquier fase del proyecto (Fase 0 a Fase 8).
---

# Flujo SDD + TDD por Fase

Este proyecto sigue un ciclo estricto guiado por especificaciones y pruebas. Ninguna fase puede saltarse estos pasos.

## Paso 1: Especificación (`docs/specs/fase-N.md`)
Antes de escribir cualquier test o código de la Fase $N$, verifica o completa `docs/specs/fase-N.md` con:
1. **Objetivo y alcance** de la fase.
2. **Contratos de entrada/salida** (esquemas JSON, rutas HTTP, códigos de estado, firmas de funciones).
3. **Casos borde e invariantes** (idempotencia, preservación de campos manuales, manejo de errores).
4. **Criterios de aceptación medibles** (lista de comprobación numerada `CA-N.1`, `CA-N.2`...).

## Paso 2: Tests de Aceptación (Rojo $\rightarrow$ Verde)
1. Escribe los tests en `life-os/test/` o `course-watcher/test/` usando `node:test` y `node:assert/strict`.
2. Cada criterio de aceptación (`CA-N.x`) debe tener al menos un `test('...', ...)` que lo verifique.
3. Para conectores externos, usa **fixtures anonimizadas** en `course-watcher/test/fixtures/`.
4. Ejecuta los tests y comprueba que fallan por la funcionalidad aún no implementada.

## Paso 3: Implementación Mínima y Limpia
1. Escribe el código en español siguiendo el estilo de `life-os` (`'use strict'`, funciones puras para lógica de negocio, inyección de dependencias para reloj/red/almacén).
2. Ejecuta las suites de pruebas:
   - `npm --prefix life-os test`
   - `npm --prefix course-watcher test`
3. Corrige hasta que el 100% de los tests estén en verde.

## Paso 4: Auditoría, Documentación y Puerta de Fase
1. Verifica con `git status` y `git diff` que no haya secretos, tokens ni archivos temporales.
2. Actualiza `docs/CHANGELOG.md` y el estado en `docs/roadmap.md`.
3. En `life-os`, asegúrate de trabajar en una rama (`feat/fase-N-...`) lista para Pull Request.
4. Presenta el resumen al usuario y **espera su confirmación** antes de iniciar la siguiente fase.
