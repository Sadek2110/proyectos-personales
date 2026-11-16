// Mapa del curso de Python: módulos, unidades y material.
export const CLASE = [
  { id: 'ent', corto: 'Entornos', nombre: 'Entornos y Sintaxis en Python', color: 'var(--l-tareas)', ahora: 'U2',
    aula: { texto: 'Abrir en Classroom', url: 'https://classroom.google.com/u/1/c/ODg3OTY0MTg0ODI4' },
    meta: '50 h, 2 h a la semana. Antonio Ortega González. Es la base del resto de módulos y se imparte en paralelo.',
    unidades: [
      { k: 'Inicio', t: 'Presentación', items: [
        { n: 'Introducción al módulo', tipo: 'PDF', nota: 'Hay que aprobar todos los RA. Sin IA en test ni exámenes prácticos, que se hacen en Spyder.' }] },
      { k: 'U1', t: 'Introducción', sum: 'Programación de alto nivel, intérpretes, algoritmos y ciclo de vida.', items: [
        { n: 'Introducción al desarrollo en Python', tipo: 'PDF' },
        { n: 'Práctica: diagrama de flujo', tipo: 'Entrega', fecha: '2026-10-13T23:59', nota: 'Consta sin entregar. Se presenta en clase y necesita validación previa del profesor.' }] },
      { k: 'U2', t: 'Sintaxis básica', sum: 'Variables, tipos de datos, operadores y comentarios.', items: [
        { n: '2.1 Mi primer programa', tipo: 'Notebook' },
        { n: '2.2 Literales de Python', tipo: 'Notebook' },
        { n: 'Ejercicios de sintaxis básica', tipo: 'PDF' },
        { n: '2.3 Operadores', tipo: 'Notebook' },
        { n: '2.3b Indexación (slicing)', tipo: 'Notebook' },
        { n: '2.3b2 Interpolación y f-strings', tipo: 'Notebook' },
        { n: '2.3c Operadores lógicos y de bits', tipo: 'Notebook' },
        { n: 'Examen de prueba: sintaxis básica', tipo: 'PDF', nota: 'Para practicar. No tiene fecha ni se entrega.' }] },
      { k: 'U3', t: 'Colecciones', items: [] },
      { k: 'U4', t: 'Depuración y pruebas', items: [] },
    ] },
  { id: 'est', corto: 'Estructuras', nombre: 'Estructuras de control en Python', color: 'var(--l-compras)', ahora: 'UD3',
    aula: { texto: 'Abrir en Moodle', url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/course/view.php?id=2005' },
    meta: '80 h',
    unidades: [
      { k: 'Inicio', t: 'Inicio de curso', items: [{ n: 'Programación didáctica 2026-27', tipo: 'PDF' }] },
      { k: 'UD1', t: 'Introducción a las estructuras de control', tri: 'T1', h: 8, items: [
        { n: 'Apuntes: algoritmos y programación', tipo: 'PDF' },
        { n: 'Apuntes: preparación del entorno', tipo: 'PDF' },
        { n: 'U1-01 Elementos de un programa informático', tipo: 'Notebook' },
        { n: 'U1-02 Estructura y bloques fundamentales', tipo: 'Notebook' },
        { n: 'U1-03 Variables, tipos y comentarios', tipo: 'Notebook' },
        { n: 'U1-04 Literales y lectura por teclado', tipo: 'Notebook' },
        { n: 'U1-05 Constantes, operadores y conversión de tipos', tipo: 'Notebook' },
        { n: 'U1-06 Estructuras de control y manejo de errores', tipo: 'Notebook' },
        { n: 'Python 3 cheat sheet', tipo: 'PDF' },
        { n: 'U1-07 Identificación de las estructuras de control', tipo: 'Notebook' },
        { n: 'Prueba UT1 (alumnado nuevo)', tipo: 'Prueba', fecha: '2026-11-03T17:15' },
        { n: 'Prueba práctica U1: ejercicios 1 a 3', tipo: 'Prueba', nota: 'Sin fecha ni entrega abierta. Consúltalo con el profesor.' }] },
      { k: 'UD2', t: 'Sentencias condicionales', tri: 'T1', h: 18, items: [
        { n: 'U2-01 Introducción a Tkinter (I)', tipo: 'Notebook' },
        { n: 'U2-02 Introducción a Tkinter (II)', tipo: 'Notebook' },
        { n: 'U2-03 Clases en Tkinter y TTK', tipo: 'Notebook' },
        { n: 'U2-04 Ejercicios con Tkinter y TTK', tipo: 'Notebook' },
        { n: 'U2-05 Repaso introductorio a Tkinter', tipo: 'Notebook' },
        { n: 'Proyecto U2: calculadora de precio final', tipo: 'Entrega', fecha: '2026-11-06T23:59', nota: 'Entrega el .ipynb o un .py. El profesor pide no usar un LLM para hacerla, solo para dudas puntuales.' },
        { n: 'U2-06 Sentencias condicionales (repaso)', tipo: 'Notebook' },
        { n: 'U2-07 Sentencias condicionales (ejercicios)', tipo: 'Notebook' },
        { n: 'Prueba U2', tipo: 'Prueba', fecha: '2026-11-10T17:15' }] },
      { k: 'UD3', t: 'Sentencias iterativas', tri: 'T2', h: 20, items: [
        { n: 'The Big Book of Small Python Projects', tipo: 'Enlace', url: 'https://inventwithpython.com/bigbookpython/' },
        { n: 'U3-01 Juego Bagels', tipo: 'Notebook' },
        { n: 'U3-02 La paradoja del cumpleaños', tipo: 'Notebook' },
        { n: 'U3-03 Mensaje formando una imagen', tipo: 'Notebook' },
        { n: 'Proyecto U3: mapa web de volcanes con Folium', tipo: 'Entrega', fecha: '2026-11-11T23:59', nota: 'Implementa los retos del final del cuaderno. Entrega el HTML y un texto corto con lo que has cambiado.' },
        { n: 'Datos del proyecto: Volcanoes_USA.txt', tipo: 'Datos' },
        { n: 'Datos del proyecto: world.json', tipo: 'Datos' },
        { n: 'U3-13 Sentencias iterativas (repaso)', tipo: 'Notebook' },
        { n: 'U3-14 Sentencias iterativas (ejercicios)', tipo: 'Notebook' },
        { n: 'Prueba U3', tipo: 'Prueba', fecha: '2026-11-17T18:30' }] },
      { k: 'UD4', t: 'Funciones', tri: 'T2', h: 22, items: [
        { n: 'Proyecto U4: sitio web con Flask', tipo: 'Entrega', fecha: '2026-11-29T23:59', nota: 'Haz los ejercicios del final del cuaderno. Entrega solo un PDF con textos y capturas, y la URL de la web desplegada en Render. El profesor pide no usar un LLM para hacerla.' },
        { n: 'U4-01 Funciones (repaso)', tipo: 'Notebook' },
        { n: 'U4-02 Funciones (ejercicios)', tipo: 'Notebook' },
        { n: 'Prueba U4', tipo: 'Prueba', fecha: '2026-11-18T18:30' }] },
      { k: 'UD5', t: 'Código eficiente y robusto', tri: 'T3', h: 12, items: [
        { n: 'Proyecto U5: FastAPI y LLMs', tipo: 'Entrega', fecha: '2026-12-06T23:59', nota: 'Ejercicios 1 a 6 y al menos un reto de la parte 7. Entrega solo un PDF con textos y capturas. Render es optativo. El profesor pide no usar un LLM para hacerla.' },
        { n: 'U5-01 Código eficiente y robusto (repaso)', tipo: 'Notebook' },
        { n: 'U5-02 Código eficiente y robusto (ejercicios)', tipo: 'Notebook' },
        { n: 'Prueba U5', tipo: 'Prueba', fecha: '2026-11-24T18:30' }] },
    ] },
  { id: 'poo', corto: 'POO', nombre: 'Programación orientada a objetos', color: 'var(--l-rutas)', ahora: 'T1',
    aula: { texto: 'Abrir en Moodle', url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/course/view.php?id=2475' },
    meta: 'Javier Caselli Fernández. Sin programación disponible: faltan las horas y los temas siguientes.',
    unidades: [
      { k: 'General', t: 'Repositorio', items: [
        { n: 'Repositorio del curso en GitHub', tipo: 'Enlace', url: 'https://github.com/javiercaselli/POODALP2627' }] },
      { k: 'T1', t: 'Python y primeros objetos', sum: 'Cadenas, listas, clase Libro, decisiones, bucles, funciones, clases propias y persistencia en JSON.', items: [
        { n: 'Python en consola y VSCode: entornos virtuales', tipo: 'PDF' },
        { n: 'Cuaderno de ejercicios (20 ejercicios)', tipo: 'PDF' },
        { n: 'Archivos iniciales del cuaderno', tipo: 'ZIP' },
        { n: 'Tarea: un almacén y un centro de talleres', tipo: 'Entrega', fecha: '2026-11-04T23:59', alerta: true, nota: 'Entrega almacen.py, centro.py y los dos JSON. Tus soluciones e01 a e20 son del cuaderno, no de esta práctica.' },
        { n: 'Apuntes POO en Python (GitHub)', tipo: 'Enlace', url: 'https://github.com/javiercaselli/POODALP2627/blob/main/README.md' },
        { n: 'Tarea 2: encapsulación, tipos de métodos y ciclo de vida', tipo: 'Entrega', fecha: '2026-11-16T23:59', url: 'https://github.com/javiercaselli/POODALP2627/blob/main/01-encapsulacion.md', nota: 'Haz las tareas del cuaderno 01-encapsulacion.md del repositorio.' }] },
      { k: 'Vídeos', t: 'Clases grabadas', items: [
        { n: 'Relación Python y POO, parte 1 (19 oct)', tipo: 'Vídeo', url: 'https://drive.google.com/file/d/1BbxJ5CwaOJVn_QsCb1v30LXT4xnM30Fg/view', nota: 'Solo online. Ábrela con la cuenta del centro.' },
        { n: 'Relación Python y POO, parte 2 (21 oct)', tipo: 'Vídeo', url: 'https://drive.google.com/file/d/1y31uLPV2mhqjM8Dc3x3MLtAMYd6ak2Rz/view', nota: 'Solo online. Ábrela con la cuenta del centro.' }] },
      { k: 'Próximos', t: 'Temas por publicar', items: [] },
    ] },
  { id: 'ana', corto: 'Análisis', nombre: 'Análisis de datos en Python', color: 'var(--l-clase)', ahora: 'Inicio',
    aula: { texto: 'Abrir en Moodle', url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/course/view.php?id=2006' },
    meta: '150 h',
    unidades: [
      { k: 'Inicio', t: 'Inicio de curso', items: [
        { n: 'Programación didáctica 2026-27', tipo: 'PDF' },
        { n: 'Presentación inicial: introducción al lenguaje', tipo: 'PDF' }] },
      { k: 'UD1', t: 'Acceso a datos', tri: 'T1', h: 15, items: [] },
      { k: 'UD2', t: 'Manipulación, limpieza y estandarización', tri: 'T2', h: 50, items: [] },
      { k: 'UD3', t: 'Análisis exploratorio de datos', tri: 'T2', h: 50, items: [] },
      { k: 'UD4', t: 'Modelado estadístico de datos', tri: 'T3', h: 35, items: [] },
    ] },
];

export const idItem = (m, u, it) => `${m.id}/${u.k}/${it.n}`;
export const tituloClase = (m, it) => `${m.corto}: ${it.n}`;
export const esActividad = it => it.tipo === 'Entrega' || it.tipo === 'Prueba';
export const conMaterial = u => u.items.some(i => i.tipo !== 'Prueba');

// Una entrega o prueba añadida a Tareas o al Horario queda enlazada por su título.
export const tareaDeItem = (tareas, m, it) => (it.fecha ? tareas?.find(t => t.titulo === tituloClase(m, it)) : undefined);
export const eventoDeItem = (eventos, m, it) => (it.fecha ? eventos?.find(e => e.titulo === tituloClase(m, it)) : undefined);

export function hechoItem(ctx, m, u, it) {
  const t = tareaDeItem(ctx.tareas, m, it);
  return t ? !!t.completada : !!ctx.hecho?.[idItem(m, u, it)];
}

const sumar = cuentas => cuentas.reduce((a, c) => ({ total: a.total + c.total, hechos: a.hechos + c.hechos }), { total: 0, hechos: 0 });
export const cuentaUnidad = (ctx, m, u) => ({ total: u.items.length, hechos: u.items.filter(i => hechoItem(ctx, m, u, i)).length });
export const cuentaModulo = (ctx, m) => sumar(m.unidades.map(u => cuentaUnidad(ctx, m, u)));
export const claseTotal = ctx => sumar(CLASE.map(m => cuentaModulo(ctx, m)));

export function recorrerClase(fn) {
  CLASE.forEach(m => m.unidades.forEach(u => u.items.forEach(it => fn(m, u, it))));
}

export function entregasUrgentes(ctx, hoy) {
  let n = 0;
  recorrerClase((m, u, it) => {
    if (it.tipo === 'Entrega' && it.fecha && it.fecha.slice(0, 10) <= hoy && !hechoItem(ctx, m, u, it)) n++;
  });
  return n;
}
