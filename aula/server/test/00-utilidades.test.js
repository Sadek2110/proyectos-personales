// Pruebas unitarias de las funciones puras que usan los requisitos: IDs del Sheet,
// fechas en la zona horaria del curso y textos de los correos.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://sin-conexion/aula';
let ids;
let fechas;
let correo;
let seed;
before(async () => {
  ids = await import('../src/lib/ids.js');
  fechas = await import('../src/lib/fechas.js');
  correo = await import('../src/lib/correo.js');
  seed = await import('../src/seed.js');
});

describe('IDs iguales a los del Sheet de seguimiento', () => {
  test('asistencia: SESIÓN_ALUMNO', () => {
    assert.equal(ids.idAsistencia('SES001', 'ALU004'), 'SES001_ALU004');
  });

  test('resultado: ALUMNO_EJERCICIO_Ixx con dos cifras', () => {
    assert.equal(ids.idResultado('ALU001', 'T01_E01', 1), 'ALU001_T01_E01_I01');
    assert.equal(ids.idResultado('ALU012', 'T20_E01', 12), 'ALU012_T20_E01_I12');
  });
});

describe('Fechas en la zona horaria de Ceuta', () => {
  test('el día cambia a medianoche de Ceuta, no del servidor', () => {
    assert.equal(fechas.hoy(new Date('2026-10-07T22:30:00Z')), '2026-10-08', '00:30 en Ceuta (verano, UTC+2)');
    assert.equal(fechas.hoy(new Date('2026-12-07T22:30:00Z')), '2026-12-07', '23:30 en Ceuta (invierno, UTC+1)');
  });

  test('minutos desde medianoche en Ceuta', () => {
    assert.equal(fechas.minutosDelDia(new Date('2026-10-08T07:35:00Z')), 9 * 60 + 35);
  });

  test('convierte una hora HH:MM a minutos', () => {
    assert.equal(fechas.horaAMinutos('09:30'), 570);
    assert.equal(fechas.horaAMinutos(null), null);
  });
});

describe('Textos de los correos', () => {
  test('invitación de alta con el enlace y la firma del profesor', () => {
    const { asunto, texto } = correo.textoInvitacion({ nombre: 'Ana', enlace: 'https://aula/x', tipo: 'alta', profesor: 'Sadek' });
    assert.match(asunto, /Competencias Digitales/);
    assert.match(texto, /^Hola, Ana:/);
    assert.ok(texto.includes('https://aula/x'));
    assert.ok(texto.trim().endsWith('Sadek'));
  });

  test('enlace de nueva contraseña', () => {
    const { asunto, texto } = correo.textoInvitacion({ enlace: 'https://aula/r', tipo: 'reset' });
    assert.match(asunto, /contraseña/i);
    assert.match(texto, /^Hola:/);
    assert.ok(texto.includes('https://aula/r'));
  });

  test('sin SMTP configurado no intenta enviar el correo', async () => {
    assert.equal(correo.smtpConfigurado(), false);
    assert.equal(await correo.enviarCorreo({ para: 'a@b.es', asunto: 'x', texto: 'y' }), false);
  });
});

describe('Contenido generado del temario', () => {
  const tema = {
    id: 'T01', objetivo: 'Abrir programas.', saber: ['Uno.', 'Dos.'], entrega: 'T01_Prueba.docx',
    pasos: ['Abre Word', 'Guarda'], comprueba: ['Se abre'], mas: 'Repite.', pronto: 'Ayuda a otro.',
  };

  test('el tema tiene sus apartados', () => {
    const md = seed.contenidoTema(tema);
    for (const h of ['## Qué aprenderás', '## Lo que necesitas saber', '## Antes de practicar']) assert.ok(md.includes(h), h);
    assert.ok(md.includes('T01_E01'));
  });

  test('el enunciado numera los pasos y dice qué entregar', () => {
    const md = seed.enunciadoEjercicio(tema);
    assert.ok(md.includes('1. Abre Word\n2. Guarda'));
    assert.ok(md.includes('T01_Prueba.docx'));
  });
});
