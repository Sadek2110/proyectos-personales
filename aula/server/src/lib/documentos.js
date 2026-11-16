// Genera el PDF y el Word descargables de un tema o ejercicio a partir de su Markdown,
// para que el alumnado pueda descargarlos sin depender de los permisos de Google Drive.
import { Document, HeadingLevel, Packer, Paragraph, TextRun, LevelFormat, AlignmentType } from 'docx';
import { marked } from 'marked';
import PDFDocument from 'pdfkit';

const ROJO = '#A91E2C';

/** Convierte Markdown en bloques simples: titulo, parrafo, lista */
function bloques(markdown) {
  const plano = (t) => (t || '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  const salida = [];
  for (const tok of marked.lexer(markdown || '')) {
    if (tok.type === 'heading') salida.push({ tipo: 'titulo', texto: plano(tok.text) });
    else if (tok.type === 'paragraph') salida.push({ tipo: 'parrafo', texto: plano(tok.text) });
    else if (tok.type === 'list') salida.push({ tipo: 'lista', ordenada: tok.ordered, items: tok.items.map((i) => plano(i.text)) });
    else if (tok.type === 'blockquote') salida.push({ tipo: 'parrafo', texto: plano(tok.text) });
  }
  return salida;
}

export function generarPdf({ titulo, subtitulo, markdown }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: titulo } });
  doc.fillColor(ROJO).font('Helvetica-Bold').fontSize(10).text('CÁMARA DE COMERCIO DE CEUTA · AULA CONSERJERÍA');
  doc.moveDown(0.6);
  doc.fillColor('#1A1A1A').fontSize(24).text(titulo);
  if (subtitulo) doc.fillColor('#555555').font('Helvetica').fontSize(13).text(subtitulo);
  doc.moveDown(0.8);
  for (const b of bloques(markdown)) {
    if (b.tipo === 'titulo') {
      doc.moveDown(0.6).fillColor(ROJO).font('Helvetica-Bold').fontSize(16).text(b.texto).moveDown(0.3);
    } else if (b.tipo === 'parrafo') {
      doc.fillColor('#1A1A1A').font('Helvetica').fontSize(13).text(b.texto, { lineGap: 4 }).moveDown(0.5);
    } else {
      b.items.forEach((item, i) => {
        doc.fillColor('#1A1A1A').font('Helvetica').fontSize(13)
          .text(`${b.ordenada ? `${i + 1}.` : '•'}  ${item}`, { indent: 10, lineGap: 4 });
      });
      doc.moveDown(0.5);
    }
  }
  doc.end();
  return doc; // stream legible
}

export async function generarDocx({ titulo, subtitulo, markdown }) {
  const hijos = [
    new Paragraph({ children: [new TextRun({ text: 'Cámara de Comercio de Ceuta · Aula Conserjería', color: 'A91E2C', bold: true, size: 20 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titulo, size: 48, bold: true })] }),
  ];
  if (subtitulo) hijos.push(new Paragraph({ children: [new TextRun({ text: subtitulo, color: '555555', size: 26 })] }));
  let lista = 0;
  for (const b of bloques(markdown)) {
    if (b.tipo === 'titulo') {
      hijos.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text: b.texto, color: 'A91E2C', bold: true, size: 32 })] }));
    } else if (b.tipo === 'parrafo') {
      hijos.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: b.texto, size: 26 })] }));
    } else {
      lista += 1;
      for (const item of b.items) {
        hijos.push(new Paragraph({
          numbering: { reference: b.ordenada ? 'numeros' : 'vinetas', level: 0, instance: lista },
          children: [new TextRun({ text: item, size: 26 })],
        }));
      }
    }
  }
  const nivel = (format, text) => ({
    reference: format === LevelFormat.DECIMAL ? 'numeros' : 'vinetas',
    levels: [{ level: 0, format, text, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }],
  });
  const doc = new Document({
    creator: 'Aula Conserjería',
    title: titulo,
    styles: { default: { document: { run: { font: 'Arial' } } } },
    numbering: { config: [nivel(LevelFormat.DECIMAL, '%1.'), nivel(LevelFormat.BULLET, '•')] },
    sections: [{ children: hijos }],
  });
  return Packer.toBuffer(doc);
}

/** Nombre de archivo seguro: "T01 Escritorio y ventanas" */
export function nombreArchivo(id, titulo, ext) {
  const limpio = `${id} ${titulo}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${limpio}.${ext}`;
}
