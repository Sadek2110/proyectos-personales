// Servidor MCP en /mcp, sin estado: cada petición crea su servidor y su transporte.
'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const anotaciones = h => ({
  readOnlyHint: h.tipo === 'lectura',
  destructiveHint: h.tipo === 'destructiva',
  openWorldHint: false,
});

function crearServidor(herramientas) {
  const servidor = new Server({ name: 'life-os', version: '1.0.0' }, { capabilities: { tools: {} } });
  servidor.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: herramientas.lista.map(h => ({ name: h.nombre, description: h.descripcion, inputSchema: h.parametros, annotations: anotaciones(h) })),
  }));
  servidor.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const h = herramientas.buscar(params.name);
    if (!h) return { isError: true, content: [{ type: 'text', text: `Herramienta desconocida: ${params.name}` }] };
    try {
      const resultado = await herramientas.ejecutar(h, params.arguments);
      return { content: [{ type: 'text', text: JSON.stringify(resultado ?? true) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: e.message }] };
    }
  });
  return servidor;
}

function crearMcp({ herramientas, tokenValido, origen, leerCuerpo, json }) {
  return async function atender(req, res) {
    const origenPeticion = req.headers.origin;
    if (origenPeticion && origenPeticion !== origen) return json(res, 403, { error: 'Origen no permitido' });
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m || !tokenValido(m[1])) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return json(res, 401, { error: 'Token no válido' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Método no permitido' }); // sin estado no hay canal SSE que abrir
    }
    let cuerpo;
    try {
      cuerpo = JSON.parse(await leerCuerpo(req, 1024 * 1024));
    } catch {
      return json(res, 400, { error: 'JSON no válido' });
    }
    const servidor = crearServidor(herramientas);
    const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transporte.close(); servidor.close(); });
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, cuerpo);
  };
}

module.exports = { crearMcp };
