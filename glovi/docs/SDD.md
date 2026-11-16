# Registro SDD · MVP GLOVI

Fecha de ejecución: 24-09-2026. Entorno: Node 24.21.0, Linux, SQLite de Node, Chromium de Playwright. Requisitos y aceptación definidos antes de la implementación en REQUISITOS-MVP.md. Los PDF originales no se han modificado.

## Ciclos ejecutados

| Ciclo | Especificación/prueba | Rojo observado | Cambio y verde |
| --- | --- | --- | --- |
| 1 | 16 escenarios de API para F01–F10 | Primera ejecución: módulo app inexistente. Tras implementación: 11 pasan, 5 fallan por inserción de reservas con 12 placeholders para 11 columnas. | Corrección de inserción; 16/16 pasan. Incluye aforo concurrente, claves idempotentes, aislamiento entre visitantes y cancelación. |
| 2 | 11 escenarios adicionales de proveedor, geometría, persistencia y seguridad | 24/27 pasan: «create» clasificado como comida por contener «eat»; límite global bloquea emergencias; origen HTTPS detrás del proxy rechazado. | Límites de palabra en intención, excepción para directorio público, origen público configurable y cookie particionada en HTTPS; 27/27 pasan. |
| 3 | Compilación TypeScript + build | Referencia mutable de React sin valor inicial/tipo undefined. | Inicialización y tipado explícitos; build correcto. |
| 4 | 4 recorridos iniciales en Chromium | 3/4 pasan: casilla de permiso controlada vuelve temporalmente a su valor anterior mientras guarda. | Actualización inmediata del estado y reversión si falla el servidor; se añade prueba específica del error. |
| 5 | 7 recorridos de navegador; ruta completa | 6/7 pasan: al cambiar posición, Chromium emite POSITION_UNAVAILABLE (código 2) transitorio y el cliente cancela el seguimiento. Diagnóstico con eventos reales de geolocalización. | Solo PERMISSION_DENIED detiene seguimiento; pérdida de señal muestra espera y se recupera. Se retira diagnóstico temporal. 7/7 pasan. |

## Mejora visual posterior

La portada de visitante incorpora una imagen principal, accesos a ruta, asistente y reservas, iconos de navegación y fotografías ilustrativas en la guía. Las imágenes se guardan localmente en WebP y se identifican como ilustrativas para no presentarlas como documentación exacta de cada monumento. El widget conserva el acceso directo al asistente. Se añadió un recorrido de navegador F03 que comprueba la carga de la imagen principal y la navegación desde la portada; revisión visual en escritorio y móvil sin desbordamiento horizontal.

## Resultado de aceptación

- **27 pruebas API/dominio/contrato de proveedor: pasan.**
- **8 pruebas de navegador: pasan.**
- **TypeScript y build de producción: pasan.**
- No hay pruebas omitidas, marcadas TODO ni escenarios que se hayan desactivado para obtener el resultado.

## Matriz de trazabilidad

| ID | Evidencia API/dominio | Evidencia navegador |
| --- | --- | --- |
| F01 | Preferencias, validación, sesión persistente tras reinicio | Cambio de idioma, persistencia tras recarga, reversión de guardado fallido |
| F02 | Respuesta local, historial, cuatro idiomas, consentimiento, revocación, emergencia determinista, fallo proveedor, contrato HTTP Gemini | Consulta y respuesta visibles; conservación tras recarga |
| F03 | POI localizado, filtro por interés y paradas válidas | Portada con imagen local, acceso a ruta y asistente; catálogo y narraciones durante ruta |
| F04 | Distancia real, umbral, antimeridiano, coordenadas inválidas, precisión, consentimiento, duplicados, progreso, abandono | Tres posiciones GPS, recuperación de señal, ruta completa, retirada de permiso, denegación GPS y ausencia de voz |
| F05 | Acceso sin cookie en cuatro idiomas, fuentes y destinos, exención de rate limit | Enlace tel:112 y navegación accesible |
| F06 | Persistencia, validación, ocho solicitudes concurrentes sin sobreventa, idempotencia, cancelación y aislamiento | Visitante solicita; operador confirma en otra sesión; visitante consulta y cancela |
| F07 | Protección por token, creación de servicio/turno, fecha futura, aforo, transiciones | Autenticación y confirmación desde panel |
| F08 | Cabeceras, cookies, origen hostil, JSON inválido, tamaño máximo, rate limit, exportación, borrado, consulta IA pendiente tras borrado | Descarga de datos, borrado y nueva sesión |
| F09 | Configuración de origen público, cookie HTTPS particionada, validación de frame ancestors | Script real crea iframe con chat funcional; árabe RTL en 390 px sin desbordamiento horizontal |
| F10 | Estados de integración sin afirmar servicios inexistentes | Etiquetas DEMO, guía local y eSIM no disponible |

Archivos: `tests/api.test.ts`, `tests/robustness.test.ts`, `tests/e2e/flows.spec.ts`. Ejecución conjunta: `npm run check`.

## Qué prueban y qué no

Las pruebas ejecutan HTTP real contra el backend, SQLite real, el build real de React y Chromium real. La posición GPS se emula en Chromium. El contrato de Gemini se prueba con respuestas HTTP controladas y fallos inducidos; no se consumen créditos ni se valida una cuenta real. Las voces del sistema no se prueban acústicamente; se comprueba el comportamiento cuando no hay voz. El widget se prueba integrado en el mismo origen, y la configuración cross-site se comprueba en API; queda por validar cada dominio HTTPS anfitrión y su política de cookies.

No acreditan contenido turístico validado sobre el terreno, precisión de GPS de dispositivos físicos, operación de negocios reales, compras eSIM, respuesta de Google Maps, seguridad de infraestructura ni cumplimiento normativo de un despliegue público. Esos límites están separados de las funciones locales implementadas.
