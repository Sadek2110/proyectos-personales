'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const FIXTURES_MOODLE = path.join(__dirname, 'fixtures', 'moodle');
const FIXTURES_CIBER = path.join(__dirname, 'fixtures', 'ciber');
const FIXTURES_CLASSROOM = path.join(__dirname, 'fixtures', 'classroom');

describe('Fase 0 — Fixtures de descubrimiento y anonimización', () => {
  test('existen las fixtures de Moodle Centros para los 3 módulos (2005, 2475, 2006)', () => {
    for (const archivo of [
      'site_info.json',
      'enrolled_courses.json',
      'course_2005_contents.json',
      'course_2475_contents.json',
      'course_2006_contents.json',
      'assignments.json',
      'grades_2005.json',
      'grades_2475.json',
      'grades_2006.json',
    ]) {
      const ruta = path.join(FIXTURES_MOODLE, archivo);
      assert.ok(fs.existsSync(ruta), `Falta fixture: ${archivo}`);
      const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      assert.ok(datos, `JSON vacío en ${archivo}`);
    }
  });

  test('las fixtures de Moodle están anonimizadas y no contienen tokens ni datos sensibles', () => {
    const archivos = fs.readdirSync(FIXTURES_MOODLE).filter(f => f.endsWith('.json'));
    for (const archivo of archivos) {
      const texto = fs.readFileSync(path.join(FIXTURES_MOODLE, archivo), 'utf8');
      assert.ok(!texto.includes('sbenaki'), `Usuario real filtrado en ${archivo}`);
      assert.ok(!texto.includes('XLXRJL'), `Contraseña filtrada en ${archivo}`);
      assert.ok(!/\b\d{8}[a-zA-Z]\b/.test(texto.replace(/00000000X/g, '')), `DNI real filtrado en ${archivo}`);
    }
  });

  test('la fixture de Google Classroom contiene estructura de temas, materiales y entregas', () => {
    const ruta = path.join(FIXTURES_CLASSROOM, 'classroom_sample.json');
    assert.ok(fs.existsSync(ruta));
    const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    assert.ok(Array.isArray(datos.topics) && datos.topics.length > 0);
    assert.ok(Array.isArray(datos.courseWork) && datos.courseWork.length > 0);
    assert.ok(Array.isArray(datos.courseWorkMaterials) && datos.courseWorkMaterials.length > 0);
  });

  test('existen las fixtures de Ciberseguridad (Moodle FP Ceuta) para los 6 módulos y están anonimizadas', () => {
    for (const archivo of [
      'site_info.json',
      'enrolled_courses.json',
      'course_311_contents.json',
      'course_177_contents.json',
      'course_175_contents.json',
      'course_174_contents.json',
      'course_173_contents.json',
      'course_172_contents.json',
      'assignments.json',
    ]) {
      const ruta = path.join(FIXTURES_CIBER, archivo);
      assert.ok(fs.existsSync(ruta), `Falta fixture ciber: ${archivo}`);
      const texto = fs.readFileSync(ruta, 'utf8');
      assert.ok(!texto.includes('sadekb.jouda'), `Usuario real filtrado en ${archivo}`);
      assert.ok(!texto.includes('Deksa-2110'), `Contraseña filtrada en ${archivo}`);
    }
  });
});
