# API del piloto

Base `/api`. JSON. Sesión mediante cookie HttpOnly creada por `GET /session`. Errores: `{ "error": { "code": "...", "fields": [] } }` (fields solo para validación). Mutaciones de navegador limitadas al origen de la app. El idioma de error es un código estable traducido por el cliente.

| Método/ruta | Función | Acceso |
| --- | --- | --- |
| GET /status | Idiomas, ciudad y estado real de integraciones | Público |
| GET /session | Obtener/crear sesión y preferencias | Público |
| PATCH /preferences | language, interests, locationConsent, aiConsent | Sesión |
| GET /pois?language=es&interest=history | Catálogo/narraciones; filtros opcionales | Público |
| GET /routes?language=es | Ruta y paradas ordenadas | Público |
| POST /tours | `{routeId:"ceuta-centro"}`; iniciar o recuperar ruta activa | Sesión |
| GET /tours/current | Progreso de último recorrido | Sesión |
| DELETE /tours/current | Abandonar recorrido activo | Sesión |
| POST /location | `{latitude,longitude,accuracy}`; llegada y progreso; no almacena GPS | Sesión y consentimiento |
| GET /emergencies?language=es | 112, pasos, fuentes y direcciones | Público; exento del límite de API |
| GET /chat/history | Últimas 40 entradas | Sesión |
| POST /chat | `{message}`; respuesta, mode, intent, sources | Sesión; consentimiento para proveedor externo |
| GET /services | Servicios y turnos futuros con plazas disponibles | Público |
| POST /bookings | `{slotId,partySize,name,contact,idempotencyKey}` | Sesión |
| GET /bookings | Reservas propias | Sesión |
| POST /bookings/:id/cancel | Cancelar/liberar plazas; repetible | Sesión propietaria |
| GET /privacy/export | Perfil, mensajes, recorridos y reservas | Sesión |
| DELETE /privacy | Borrado en cascada y eliminación de cookie | Sesión |
| GET /admin/bookings | Todas las solicitudes del piloto | Bearer ADMIN_TOKEN |
| PATCH /admin/bookings/:id | `{status:"confirmed"}` o rejected, solo desde requested | Bearer ADMIN_TOKEN |
| POST /admin/services | `{name,kind,description,demo}`; kind restaurant/experience | Bearer ADMIN_TOKEN |
| POST /admin/services/:id/slots | `{startsAt,capacity}`; fecha futura ISO con zona | Bearer ADMIN_TOKEN |

Respuestas de reserva: HTTP 201 al crear, 200 al repetir exactamente la misma solicitud; 409 si la clave se reutiliza con otro contenido o falta aforo. Fechas persistidas en UTC y mostradas en Europe/Madrid. Solicitadas y confirmadas ocupan plazas. Canceladas/rechazadas no.

Protecciones: entradas estrictas con Zod, consultas parametrizadas, transacciones BEGIN IMMEDIATE, identidad de cookie almacenada como SHA-256, límite de cuerpo 32 KiB, consulta de chat 2.000 caracteres, una consulta de IA simultánea por sesión, límite general 240 peticiones/minuto por conexión IP. El servicio público de emergencias no consulta la IA ni necesita sesión. Los proveedores y el cuerpo de las peticiones no se registran en los logs.
