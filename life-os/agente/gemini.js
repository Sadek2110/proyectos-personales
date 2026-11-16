// Acceso a Gemini. Es el único archivo que conoce al proveedor del modelo.
'use strict';

const TIEMPO_MAXIMO = 45e3;
const SOBRECARGA = new Set([429, 500, 502, 503, 504]); // fallos pasajeros: los puede resolver el modelo de reserva

function mensajeDeError(e) {
  if (e.status === 429) return 'Se ha agotado por ahora la cuota gratuita de Gemini. Prueba dentro de un rato.';
  if (e.status === 400 && /API.?KEY/i.test(e.message) || e.status === 401 || e.status === 403) return 'Google ha rechazado la clave GEMINI_API_KEY.';
  if (e.status === 404) return 'Google no reconoce el modelo configurado en GEMINI_MODEL.';
  if (SOBRECARGA.has(e.status)) return 'Gemini está saturado en este momento. Prueba dentro de un rato.';
  if (e.status) return `Gemini ha rechazado la petición (error ${e.status}).`;
  return 'No se pudo contactar con Gemini.';
}

/** `cliente` solo se pasa en las pruebas. */
function crearModelo({ apiKey, modelo, reserva, cliente }) {
  const api = cliente || new (require('@google/genai').GoogleGenAI)({ apiKey, httpOptions: { timeout: TIEMPO_MAXIMO } });

  async function llamar(model, { system, contents, tools }) {
    const r = await api.models.generateContent({
      model, contents,
      config: {
        systemInstruction: system,
        ...(tools?.length ? {
          tools: [{ functionDeclarations: tools.map(h => ({ name: h.nombre, description: h.descripcion, parametersJsonSchema: h.parametros })) }],
        } : {}),
      },
    });
    // El contenido se devuelve tal cual: las firmas de razonamiento tienen que volver intactas en la siguiente ronda.
    const content = r.candidates?.[0]?.content;
    const parts = content?.parts || [];
    return {
      content,
      llamadas: parts.filter(p => p.functionCall).map(p => p.functionCall),
      texto: parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim(),
    };
  }

  return {
    async generar(peticion) {
      try {
        return await llamar(modelo, peticion);
      } catch (e) {
        console.error(`[gemini] ${modelo}: ${e.status || ''} ${e.message}`);
        if (reserva && reserva !== modelo && SOBRECARGA.has(e.status)) {
          try {
            return await llamar(reserva, peticion);
          } catch (e2) {
            console.error(`[gemini] ${reserva}: ${e2.status || ''} ${e2.message}`);
            throw new Error(mensajeDeError(e2));
          }
        }
        throw new Error(mensajeDeError(e));
      }
    },
  };
}

module.exports = { crearModelo };
