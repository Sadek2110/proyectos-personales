'use strict';

const EXTENSIONES_DESCARGABLES = [
  '.pdf',
  '.ipynb',
  '.zip',
  '.txt',
  '.json',
  '.csv',
];

function esArchivoDescargable(archivo) {
  if (!archivo || !archivo.filename || !archivo.fileurl) return false;
  const nombre = String(archivo.filename).toLowerCase();
  return EXTENSIONES_DESCARGABLES.some(ext => nombre.endsWith(ext));
}

function construirUrlConToken(fileurl, wstoken) {
  const base = String(fileurl || '');
  const separador = base.includes('?') ? '&' : '?';
  return `${base}${separador}token=${encodeURIComponent(wstoken)}`;
}

/**
 * Fábrica para sincronizar archivos adjuntos de Moodle hacia Google Drive de forma idempotente.
 */
function crearSincronizadorDrive({
  subirArchivo,
  fetchFn = global.fetch,
  estadoDrive = {},
} = {}) {
  async function sincronizarModulos(modulos = [], wstoken = '', nombreCurso = 'Curso') {
    let descargados = 0;
    let omitidos = 0;
    let errores = 0;

    for (const m of modulos || []) {
      for (const u of m.unidades || []) {
        for (const it of u.items || []) {
          const listaArchivos = Array.isArray(it.archivos) ? it.archivos : [];
          for (const archivo of listaArchivos) {
            if (!esArchivoDescargable(archivo)) continue;

            const clave = `${it.ext_id}:${archivo.filename}:${archivo.timemodified || 0}`;

            if (estadoDrive[clave]) {
              it.drive_url = estadoDrive[clave].drive_url;
              omitidos += 1;
              continue;
            }

            if (subirArchivo && wstoken) {
              try {
                const urlDescarga = construirUrlConToken(archivo.fileurl, wstoken);
                const resp = await fetchFn(urlDescarga);
                if (!resp || !resp.ok) {
                  errores += 1;
                  continue;
                }
                const buffer = Buffer.from(await resp.arrayBuffer());
                const res = await subirArchivo({
                  curso: nombreCurso,
                  modulo: m.id,
                  unidad: u.k,
                  filename: archivo.filename,
                  mimetype: archivo.mimetype,
                  buffer,
                });

                if (res && res.drive_url) {
                  estadoDrive[clave] = {
                    drive_url: res.drive_url,
                    file_id: res.file_id,
                    timemodified: archivo.timemodified || 0,
                  };
                  it.drive_url = res.drive_url;
                  descargados += 1;
                }
              } catch {
                errores += 1;
              }
            }
          }
        }
      }
    }

    return {
      descargados,
      omitidos,
      errores,
      estadoDrive,
    };
  }

  return {
    sincronizarModulos,
  };
}

module.exports = {
  crearSincronizadorDrive,
};
