# Plan de estudio — Python (POO) + Ciberseguridad

Generado el lunes 16/11/2026 a partir del estado real de ambas aulas virtuales.
Refrescar estado: `node estudio/scripts/estado-cursos.js`

**Supuesto de ritmo:** ~2,5 h/día entre semana y ~4 h/día el fin de semana. Si tu disponibilidad es otra, díselo al tutor y reajusta.

## 1. Situación de partida

### Python (Moodle Centros + Classroom)
| Módulo | Estado | Pendiente |
|---|---|---|
| **POO** | Tarea 2 enviada ✔ | **Tarea 1 (venció el 04/11) sin enviar.** Afianzar base: clases, objetos, encapsulación, métodos de clase/estáticos, ciclo de vida |
| Estructuras de control (`est`) | U1 y U2 al día, notas 10/10 | **Pruebas U3 (17/11), U4 (18/11) y U5 (24/11) a las 18:30** · Proyecto U3 Folium (Moodle lo da sin enviar; Life OS, como hecho: comprobarlo) · U4 Flask (29/11) · U5 FastAPI+LLMs (06/12) |
| Análisis de datos (`ana`) | Arrancando | Presentación inicial |

### Ciberseguridad (Aula Virtual FP Ceuta). Empiezas de cero: 0 entregas, 0 tests
| Módulo | Unidad en curso | Entrega más próxima |
|---|---|---|
| Normativa (`nc`) | UT01 Cumplimiento normativo | **Análisis de cumplimiento: 25/11** |
| Bastionado (`brs`) | T1–T3 (T4 empieza el 30/11) | BRS01 vencida (va a "prácticas pendientes") · **BRS02: 29/11** · BRS03: 14/12 · BRS04: 10/01 |
| Forense (`afi`) | UT01 Metodologías forenses | **Tarea AFI01: 30/11** |
| Incidentes (`ic`) | UD1 Planes de prevención | **Tarea + examen IC01: 30/11** |
| Hacking ético (`he`) | UT01 Conceptos y detección de vulnerabilidades | Tarea HE01: 08/12 · **Examen HE01: 09/12** |
| Puesta en producción (`pps`) | UT01 Pruebas de apps web/móvil | Tarea PPS01 **venció el 14/11** · Examen PPS01: 30/01 |

> Las fechas de IC02+, HE02+ y AFI02 que muestra Moodle (2025 / principios de 2026) vienen del curso pasado. El profesorado las irá actualizando, así que hay que confirmarlas con el script cada semana.
> Hitos: **primer parcial de BRS del 25/01 al 01/02/2027**, segundo parcial del 24 al 31/05, ordinaria del 1 al 7/06/2027.

## 2. Acciones de hoy (fuera del estudio)
1. Escribir en los foros/mensajería de **POO (Tarea 1)**, **EST (Proyecto U3)**, **PPS01** y **BRS01** para preguntar si admiten entrega tardía y hasta cuándo.
2. Dejar a mano la videollamada de Normativa (martes 13:15).

## 3. Método por unidad (lo aplica el tutor)
1. Orientaciones + mapa conceptual (15 min) → visión global.
2. Estudio guiado por bloques con preguntas de comprobación.
3. Práctica: ejercicios y casos que plantea el tutor.
4. **Cuestionario de autoevaluación** en la plataforma (lo haces tú).
5. **Tarea**: entender el enunciado → esquema → borrador tuyo → revisión del tutor → entrega.
6. Registrar el avance en `estudio/progreso.md`.

Rutina fija: **POO 45 min/día** hasta el 29/11 (cuaderno "Python y primeros objetos" + apuntes de GitHub + clases grabadas). El resto del bloque se dedica a ciberseguridad.

## 4. Calendario (sprint 16/11 → 13/12)

### Semana 1 · 16–22 nov: ponerse en marcha y Normativa
| Día | POO (45') | Bloque principal |
|---|---|---|
| L 16 | Cuaderno POO: clases y objetos | Mensajes de entrega tardía · NC: mapa conceptual + contenidos UT01 |
| M 17 | Tarea 1 POO: ejercicios 1–50 % | NC: contenidos UT01 + caso práctico de ejemplo (videollamada 13:15) |
| X 18 | Tarea 1 POO: terminar y **entregar** | NC: esquema de la tarea "Análisis de cumplimiento" |
| J 19 | Encapsulación y propiedades | NC: redactar tarea (borrador) |
| V 20 | Métodos de clase y estáticos | NC: revisar con el tutor → **entregar NC** · Test UT1 NC (abierto hasta junio, hacerlo ya) |
| S 21 | Ciclo de vida, `__str__`/`__repr__` | BRS01: página única + autoevaluación · BRS01 tarea (pendiente) |
| D 22 | Repaso POO: mini-proyecto | BRS02: contenidos + caso práctico + autoevaluación |

### Semana 2 · 23–29 nov: Bastionado, Forense e Incidentes
| Día | POO | Bloque principal |
|---|---|---|
| L 23 | Herencia (adelanto T2) | BRS02: tarea (borrador) |
| M 24 | Ejercicios | BRS02: revisar → **entregar** (límite 29/11) |
| X 25 | Ejercicios | AFI01 guiada: metodologías forenses |
| J 26 | Ejercicios | AFI01: práctica con Volatility / Strings / Floss · Cuestionario UT1 AFI |
| V 27 | — | AFI01: tarea → **entregar** (límite 30/11) |
| S 28 | — | IC01 guiada + vídeo de gestión de incidentes |
| D 29 | — | EST U4: **proyecto Flask** (límite 29/11) · IC01: esquema de la tarea |

### Semana 3 · 30 nov–6 dic: Incidentes, Hacking y FastAPI
| Día | Bloque principal |
|---|---|
| L 30 | IC01: tarea → **entregar** · **Examen IC01** (+ "examen para revisar") |
| M 1 | HE01 guiada: conceptos, fases, CVSS v4 |
| X 2 | HE01: herramientas de detección de vulnerabilidades (en laboratorio propio) |
| J 3 | HE01: tarea (borrador) |
| V 4 | PPS01 guiada (tarea vencida: según lo que respondan) |
| S 5 | EST U5: proyecto FastAPI + LLMs |
| D 6 | EST U5: **entregar** (límite 06/12) · PPS01 tarea |

### Semana 4 · 7–13 dic: HE01 y BRS03
| Día | Bloque principal |
|---|---|
| L 7 | HE01: revisar → **entregar** (límite 08/12) |
| M 8 | HE01: repaso para el examen + preguntas tipo test |
| X 9 | **Examen HE01** · BRS03 guiada |
| J 10–S 12 | BRS03: control de acceso y autenticación → tarea → **entregar** (límite 14/12) |
| D 13 | Revisión semanal + planificar el siguiente sprint (BRS04 10/01, AFI02, IC02, HE02, ANA, POO T2) |

## 5. Después del sprint (14/12 → 1/02)
- Una unidad nueva por módulo al ritmo de su calendario (se actualiza cada domingo con el script).
- BRS04 antes del 10/01 · preparar el **primer parcial de BRS (25/01–01/02)**.
- Repaso con las autoevaluaciones de cada unidad y los "exámenes para revisar" de IC.
