'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { crearResumidorTemas, esMaterialResumible } = require('../src/resumen-ia.js');
const { ejecutarPasadaFuente } = require('../src/orquestador.js');

describe('Fase 8 — Resumidor con IA de temas nuevos (course-watcher)', () => {
  describe('esMaterialResumible(item)', () => {
    it('devuelve true para PDF, Notebook, Vídeo y Enlace no archivados y sin resumen_ia', () => {
      for (const tipo of ['PDF', 'Notebook', 'Vídeo', 'Enlace']) {
        assert.equal(
          esMaterialResumible({ ext_id: `test:${tipo}`, n: `Tema ${tipo}`, tipo }),
          true,
          `Debería ser resumible el tipo ${tipo}`
        );
      }
    });

    it('devuelve false para Entrega, Prueba, Foro, ítems archivados o que ya tienen resumen_ia', () => {
      for (const tipo of ['Entrega', 'Prueba', 'Foro', 'Nota']) {
        assert.equal(
          esMaterialResumible({ ext_id: `test:${tipo}`, n: `Actividad ${tipo}`, tipo }),
          false,
          `No debería ser resumible el tipo ${tipo}`
        );
      }

      assert.equal(
        esMaterialResumible({
          ext_id: 'test:archivado',
          n: 'Apuntes antiguos',
          tipo: 'PDF',
          archivado: true,
        }),
        false,
        'No debe resumir ítems archivados'
      );

      assert.equal(
        esMaterialResumible({
          ext_id: 'test:ya-resumido',
          n: 'Apuntes ya resumidos',
          tipo: 'PDF',
          resumen_ia: '- Punto clave existente',
        }),
        false,
        'No debe volver a resumir ítems que ya tienen resumen_ia'
      );

      assert.equal(esMaterialResumible(null), false);
      assert.equal(esMaterialResumible(undefined), false);
    });
  });

  describe('crearResumidorTemas()', () => {
    it('si apiKey está vacía, resumirItem devuelve null sin invocar fetchFn', async () => {
      let llamadasFetch = 0;
      const resumidor = crearResumidorTemas({
        apiKey: '',
        fetchFn: async () => {
          llamadasFetch++;
          throw new Error('No debería llamarse fetchFn sin apiKey');
        },
      });

      const resultado = await resumidor.resumirItem({
        ext_id: 'moodle:2005:cm:101',
        n: 'U3-01 Sentencias iterativas',
        tipo: 'Notebook',
      });

      assert.equal(resultado, null);
      assert.equal(llamadasFetch, 0);
    });

    it('con fetchFn simulado 200 OK de Gemini, resumirItem devuelve el resumen en Markdown', async () => {
      const llamadas = [];
      const textoEsperado =
        '- **Bucles `while` y `for`**: estructuras iterativas en Python.\n- **Pregunta tipo test**: diferencia entre `break` y `continue`.';

      const resumidor = crearResumidorTemas({
        apiKey: 'clave-simulada-test',
        modelo: 'gemini-3.8-flash',
        fetchFn: async (url, opciones = {}) => {
          llamadas.push({ url: String(url), body: JSON.parse(opciones.body) });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [{ text: `  ${textoEsperado}\n` }],
                    },
                  },
                ],
              };
            },
          };
        },
      });

      const resumen = await resumidor.resumirItem(
        {
          ext_id: 'moodle:2005:cm:102',
          modulo: 'est',
          unidad: 'UD3',
          n: 'U3-13 Sentencias iterativas (repaso)',
          tipo: 'Notebook',
        },
        'Contenido extraído del notebook sobre while, for, range, break y continue.'
      );

      assert.equal(resumen, textoEsperado);
      assert.equal(llamadas.length, 1);
      assert.ok(
        llamadas[0].url.includes('gemini-3.8-flash:generateContent'),
        'Debe invocar el endpoint del modelo principal'
      );
    });

    it('hace fallback automático a modeloReserva cuando el modelo principal responde 429 o 503', async () => {
      for (const codigoError of [429, 503]) {
        const urlsInvocadas = [];
        const resumidor = crearResumidorTemas({
          apiKey: 'clave-simulada-test',
          modelo: 'gemini-3.8-flash',
          modeloReserva: 'gemini-3.5-flash-lite',
          fetchFn: async url => {
            const urlStr = String(url);
            urlsInvocadas.push(urlStr);
            if (urlStr.includes('gemini-3.8-flash')) {
              return {
                ok: false,
                status: codigoError,
                async json() {
                  return { error: { code: codigoError, message: 'Quota / Overloaded' } };
                },
              };
            }
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  candidates: [
                    {
                      content: {
                        parts: [{ text: `- Resumen generado con reserva (${codigoError})` }],
                      },
                    },
                  ],
                };
              },
            };
          },
        });

        const resumen = await resumidor.resumirItem({
          ext_id: `moodle:2005:cm:${codigoError}`,
          n: 'Apuntes de funciones en Python',
          tipo: 'PDF',
        });

        assert.equal(resumen, `- Resumen generado con reserva (${codigoError})`);
        assert.equal(urlsInvocadas.length, 2);
        assert.ok(urlsInvocadas[0].includes('gemini-3.8-flash'));
        assert.ok(urlsInvocadas[1].includes('gemini-3.5-flash-lite'));
      }
    });

    it('enriquecerLoteConResumenes resume solo los ítems cuyo ext_id está en idsNuevos y respeta maxPorPasada', async () => {
      const itemsResumidos = [];
      const resumidor = crearResumidorTemas({
        apiKey: 'clave-simulada-test',
        maxPorPasada: 2,
        fetchFn: async (_url, opciones = {}) => {
          const prompt = opciones.body ? JSON.parse(opciones.body).contents?.[0]?.parts?.[0]?.text || '' : '';
          itemsResumidos.push(prompt);
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [{ text: `- Resumen IA #${itemsResumidos.length}` }],
                    },
                  },
                ],
              };
            },
          };
        },
      });

      const lote = {
        fuente: 'moodle',
        completa: true,
        modulos: [
          {
            id: 'poo',
            nombre: 'Programación orientada a objetos',
            unidades: [
              {
                k: 'T1',
                t: 'Primeros objetos',
                items: [
                  { ext_id: 'moodle:2475:cm:1', n: 'Tema antiguo ya conocido', tipo: 'PDF' },
                  { ext_id: 'moodle:2475:cm:2', n: 'Tarea entregable', tipo: 'Entrega' },
                  { ext_id: 'moodle:2475:cm:3', n: 'Nuevo PDF Encapsulación', tipo: 'PDF' },
                  { ext_id: 'moodle:2475:cm:4', n: 'Nuevo Notebook Herencia', tipo: 'Notebook' },
                  { ext_id: 'moodle:2475:cm:5', n: 'Nuevo PDF Polimorfismo (excede cupo)', tipo: 'PDF' },
                ],
              },
            ],
          },
        ],
      };

      const idsNuevos = [
        'moodle:2475:cm:2',
        'moodle:2475:cm:3',
        'moodle:2475:cm:4',
        'moodle:2475:cm:5',
      ];

      await resumidor.enriquecerLoteConResumenes(lote, idsNuevos);

      const items = lote.modulos[0].unidades[0].items;
      assert.equal(items[0].resumen_ia, undefined, 'No debe resumir un ítem que no está en idsNuevos');
      assert.equal(items[1].resumen_ia, undefined, 'No debe resumir una Entrega');
      assert.equal(items[2].resumen_ia, '- Resumen IA #1');
      assert.equal(items[3].resumen_ia, '- Resumen IA #2');
      assert.equal(items[4].resumen_ia, undefined, 'Debe respetar maxPorPasada = 2');
      assert.equal(itemsResumidos.length, 2);
    });
  });

  describe('Integración en ejecutarPasadaFuente (orquestador)', () => {
    it('adjunta resumen_ia en los ítems nuevos antes de enviarlos a clienteLifeOs.enviarLote', async () => {
      const lotesEnviados = [];

      const resumidor = crearResumidorTemas({
        apiKey: 'clave-simulada-test',
        maxPorPasada: 5,
        fetchFn: async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              candidates: [
                {
                  content: {
                    parts: [{ text: '- Concepto clave de POO\n- Posible pregunta de examen' }],
                  },
                },
              ],
            };
          },
        }),
      });

      const fuenteSimulada = {
        async obtenerLote() {
          return {
            fuente: 'moodle',
            completa: true,
            modulos: [
              {
                id: 'poo',
                nombre: 'Programación orientada a objetos',
                unidades: [
                  {
                    k: 'T1',
                    t: 'Python y primeros objetos',
                    items: [
                      {
                        ext_id: 'moodle:2475:cm:501',
                        n: 'Apuntes de Clases y Objetos',
                        tipo: 'PDF',
                        url: 'https://moodle.local/mod/resource/view.php?id=501',
                      },
                      {
                        ext_id: 'moodle:2475:cm:502',
                        n: 'Práctica entregable T1',
                        tipo: 'Entrega',
                        fecha: '2026-11-20T23:59',
                      },
                    ],
                  },
                ],
              },
            ],
          };
        },
      };

      const clienteLifeOs = {
        async enviarLote(lote) {
          lotesEnviados.push(structuredClone(lote));
          return { enviado: true, status: 200, respuesta: { ok: true, data: { nuevos: 2 } } };
        },
      };

      const res = await ejecutarPasadaFuente({
        nombreFuente: 'moodle',
        fuente: fuenteSimulada,
        clienteLifeOs,
        resumidor,
      });

      assert.equal(res.ok, true);
      assert.equal(res.enviado, true);
      assert.equal(lotesEnviados.length, 1);

      const itemsEnviados = lotesEnviados[0].modulos[0].unidades[0].items;
      const pdfEnviado = itemsEnviados.find(i => i.ext_id === 'moodle:2475:cm:501');
      const entregaEnviada = itemsEnviados.find(i => i.ext_id === 'moodle:2475:cm:502');

      assert.equal(
        pdfEnviado.resumen_ia,
        '- Concepto clave de POO\n- Posible pregunta de examen',
        'El PDF nuevo enviado a Life OS debe incluir resumen_ia'
      );
      assert.equal(entregaEnviada.resumen_ia, undefined);
    });
  });
});
