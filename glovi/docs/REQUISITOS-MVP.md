# GLOVI: especificación funcional del MVP

Fecha: 24-09-2026. Fuentes: Dossier_Ejecutivo_GLOVI.pdf (E), Dossier_Tecnico_GLOVI.pdf (T), Pitch_Deck_GLOVI_Ceuta.pdf (P). Carpeta inicial sin código.

## Decisión de alcance

Piloto web en Ceuta, widget integrable, español/inglés/francés/árabe. Aplicación React/TypeScript, API Node.js, SQLite transaccional para una instancia. El stack Node está permitido por T§1. PostgreSQL y búsqueda vectorial se reservan para volumen/múltiples instancias: el pequeño catálogo local se recupera por intención y preferencias. Una aplicación modular evita introducir microservicios sin necesidad.

E§4 define explícitamente chat, rutas, emergencias y reservas. E§6 y P§7 sitúan la provisión comercial de eSIM y la expansión B2B en fase 3. Este MVP incluye información sobre disponibilidad de eSIM; no vende ni inventa perfiles. Se distinguen integraciones activas, guía local y servicios de demostración.

## Funciones mínimas y criterios de aceptación

| ID | Función y fuente | Criterios verificables |
| --- | --- | --- |
| F01 | Preferencias e idioma (E§2, T§2) | Crear sesión anónima; guardar idioma e intereses; rechazar idiomas/valores inválidos; aislamiento entre sesiones. |
| F02 | Asistente multilingüe (E§4, T§1) | Consultar visitas, gastronomía, reservas y servicios; responder en idioma elegido; historial persistente y acotado; contexto local con fuentes; adaptador Gemini real configurable; sin credenciales o ante fallo, guía local explícita, sin inventar respuesta de IA. |
| F03 | Catálogo y rutas (E§2/4) | Listar POI y ruta ordenada; filtrar por interés; narraciones ES/EN/FR/AR con fuente; iniciar y finalizar ruta; progreso persistente. |
| F04 | Proximidad y audio (E§2, T§2) | GPS solo tras consentimiento; detectar entrada a 100 m con precisión aceptable; no repetir visita; progreso y finalización; no guardar coordenadas; lectura por voz si el navegador dispone de voz; detener seguimiento al retirar consentimiento o salir. |
| F05 | Emergencias gratuitas (E§4, T§2/3, P§6) | Acceso sin cuenta/IA; 112 visible; hospitales, policía y ayuda consular; pasos localizados; navegación real delegada a Maps (sin inventar trayectos); directorio con fuentes y sin embajadas ficticias en Ceuta; dirección utilizable sin GPS. |
| F06 | Disponibilidad y reservas (E§4/5) | Catálogo de restaurante y experiencia de demostración; plazas por turno; reservar fecha futura con nombre/contacto; persistir; evitar sobreventa incluso concurrente; repetición idempotente; listar y cancelar reservas propias; liberar aforo al cancelar. Ninguna reserva demo se presenta como confirmada por un negocio real. |
| F07 | Operación del piloto (P§3, E§5) | Panel/API con token de administrador; crear servicios/turnos; consultar reservas y cambiar estado solicitado→confirmado/rechazado→sin cambios; cancelación de solicitado/confirmado; autenticación y validación obligatorias. |
| F08 | Privacidad y robustez (T§4) | Consentimiento separado para ubicación y proveedor IA; exportar y borrar perfil/historial/reservas/progreso; error uniforme; límites de peticiones/cuerpo; cookies HttpOnly, SameSite; CSP; sin secretos en cliente; sin almacenar GPS; no enviar nombre/contacto de reservas al modelo. |
| F09 | Widget y ejecución (T§1, P§3) | Script de inserción con iframe y ruta widget; instalación reproducible; interfaz funcional móvil; build y prueba real de navegador. |
| F10 | Estado de integraciones (E§3/6, T§3) | Informar claramente guía local/Gemini, reservas demo/internas y eSIM no disponible; emergencia siempre accesible sin proveedor. |

## Escenarios y reglas del dominio

- Visitante anónimo conserva sesión mediante cookie opaca; solo su sesión puede leer o cancelar sus reservas. No hay recuperación de cuenta en esta fase.
- Preferencias: ES por defecto; historia, arquitectura o gastronomía. Consentimientos revocables e independientes; no se exige GPS para usar el resto de la app.
- Geofencing: distancia Haversine, umbral fijo 100 m, precisión ≤100 m, coordenadas finitas/válidas. Una visita por parada y recorrido. Una ruta solo se completa al visitar todas las paradas; se puede abandonar y volver a iniciar. Una pérdida temporal de señal mantiene el seguimiento; la denegación de permiso lo detiene.
- Reservas: turnos fechados, capacidad total, 1–12 personas. Solicitadas y confirmadas consumen aforo. Canceladas/rechazadas lo liberan. Clave de idempotencia por sesión: mismo contenido devuelve misma reserva, contenido diferente produce conflicto. Las mutaciones de aforo se hacen dentro de transacción.
- La aplicación no procesa pagos. Confirmación interna del operador, no integración con inventario de terceros. Servicios iniciales etiquetados DEMO; no se publican datos falsos de comercios.
- El asistente no ejecuta reservas por texto: conduce al formulario donde el visitante confirma explícitamente. Las urgencias usan información determinista y nunca dependen del modelo.
- Las narraciones se basan en fuentes enlazadas; coordenadas del catálogo aproximadas para piloto, a validar a pie antes de despliegue público.

## No funcionales y límites que requieren despliegue

Las pruebas locales no acreditan cumplimiento RGPD ni seguridad de producción. TLS se termina en proxy; cifrado del volumen, política de retención, acuerdos con encargados, revisión del directorio y operación 24/7 se documentan como requisitos de despliegue. TLS no se describe como cifrado de extremo a extremo. No se afirma AES-256 en reposo en una SQLite sin cifrar.

Antigravity se menciona sin contratos/API ni definición operativa en los dosieres. El despacho de intenciones se implementa como módulo local comprobable; no se inventa una integración con esa plataforma. Se posponen app nativa, visión por cámara, rutas premium, cobros/suscripciones, conectividad eSIM real, multiempresa y RAG vectorial.

## Bucle SDD

1. Especificar requisito y escenario de aceptación.
2. Escribir prueba y comprobar fallo esperado (rojo).
3. Implementar el comportamiento mínimo coherente (verde).
4. Revisar errores, aislamiento, concurrencia y contratos; ejecutar regresión.
5. Registrar evidencia y límites en SDD.md. La parte visual queda fuera de este ciclo.
