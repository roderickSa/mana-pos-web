// Guardia de uniformidad de la interfaz. No reemplaza mirar la pantalla: sólo
// impide que vuelvan las tres cosas que se corrigieron a mano (pies de modal,
// alturas sueltas, componentes duplicados). Se corre con `npm run revisar:ui`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

function archivos(dir, extension) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta, extension);
    return ruta.endsWith(extension) ? [ruta] : [];
  });
}

// Desde '<Modal' hasta el '>' que cierra la etiqueta de apertura, contando
// llaves para no parar dentro de una prop.
function etiquetaApertura(texto, desde) {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (caracter === '{' || caracter === '(') profundidad += 1;
    else if (caracter === '}' || caracter === ')') profundidad -= 1;
    else if (caracter === '>' && profundidad === 0) return { props: texto.slice(desde, i + 1), fin: i + 1 };
  }
  return { props: texto.slice(desde), fin: texto.length };
}

const fallos = [];
const anotar = (ruta, linea, mensaje) => fallos.push(`${ruta}:${linea}  ${mensaje}`);
const lineaDe = (texto, indice) => texto.slice(0, indice).split('\n').length;

// 1. Todo modal declara pie y tamaño, y su botonera vive en el pie.
for (const ruta of archivos(RAIZ, '.tsx')) {
  if (ruta.endsWith(join('shared', 'ui', 'Modal.tsx'))) continue;
  const texto = readFileSync(ruta, 'utf8');
  for (const coincidencia of texto.matchAll(/<Modal\b/g)) {
    const { props, fin } = etiquetaApertura(texto, coincidencia.index);
    const linea = lineaDe(texto, coincidencia.index);
    if (!props.includes('footer=')) anotar(ruta, linea, 'el modal no declara footer: los botones quedan en el cuerpo que rueda');
    if (!props.includes('size=')) anotar(ruta, linea, 'el modal no declara size: usa sm | md | lg | xl');
    const cuerpo = texto.slice(fin, texto.indexOf('</Modal>', fin));
    if (/class=\{\w+\.acciones\}/.test(cuerpo)) {
      anotar(ruta, linea, 'hay una botonera dentro del cuerpo del modal: va en footer');
    }
  }
}

// 2. Toda tabla de listado lleva pie: cuántas filas hay y, si hace falta, los
//    pasos de página. El voucher de venta es la excepción: no es un listado,
//    es un comprobante con su propio resumen.
const SIN_PIE_A_PROPOSITO = new Set([
  join('src', 'features', 'sales-history', 'components', 'TicketDetail.tsx'),
]);
for (const ruta of archivos(RAIZ, '.tsx')) {
  if (SIN_PIE_A_PROPOSITO.has(ruta)) continue;
  const texto = readFileSync(ruta, 'utf8');
  const cuerpo = texto.indexOf('<tbody>');
  if (cuerpo === -1 || texto.includes('TableFooter')) continue;
  anotar(ruta, lineaDe(texto, cuerpo), 'la tabla no tiene pie: usa TableFooter de shared/ui');
}

// 3. Las alturas de control salen de la escala, no de un número suelto.
const ALTURAS_PERMITIDAS = new Set([
  join('src', 'app', 'components', 'TopBar.module.css'),           // alto de la barra
  join('src', 'app', 'theme.css'),                                 // define la escala
  join('src', 'features', 'catalog', 'components', 'CategoriesTab.module.css'), // muestra de ícono
  join('src', 'features', 'devices', 'DevicesView.module.css'),    // ícono de la tarjeta
  join('src', 'features', 'login', 'LoginView.module.css'),        // teclado de PIN, a propósito enorme
  join('src', 'features', 'reports', 'ReportsView.module.css'),    // alto del gráfico de horas
  join('src', 'features', 'sale', 'components', 'TicketPanel.module.css'), // ajuste de pantalla baja
  join('src', 'shared', 'ui', 'Keypad.module.css'),                // ajuste de pantalla baja
  join('src', 'shared', 'ui', 'tabla.module.css'),                 // miniatura de producto
]);
for (const ruta of archivos(RAIZ, '.css')) {
  if (ALTURAS_PERMITIDAS.has(ruta)) continue;
  const texto = readFileSync(ruta, 'utf8');
  for (const coincidencia of texto.matchAll(/(?<!max-)(?<!line-)\b(?:min-)?height:\s*(\d+)px\s*;/g)) {
    if (Number(coincidencia[1]) < 30) continue;
    anotar(ruta, lineaDe(texto, coincidencia.index),
      `altura suelta de ${coincidencia[1]}px: usa --alto-control, --alto-compacto o --alto-grande`);
  }
}

// 4. localStorage vive en un solo archivo. Con los borradores de formulario
//    serían diez claves sueltas y nadie sabría cuál se puede borrar.
const GUARDADO = join('src', 'shared', 'lib', 'storage.ts');
for (const ruta of archivos(RAIZ, '.ts').concat(archivos(RAIZ, '.tsx'))) {
  // Los tests del propio guardado sí miran el storage de verdad: es lo que
  // están probando.
  if (ruta === GUARDADO || ruta.endsWith('.spec.ts') || ruta.endsWith('.spec.tsx')) continue;
  const texto = readFileSync(ruta, 'utf8');
  const encontrado = /localStorage\s*\.\s*\w/.exec(texto);
  if (encontrado !== null) {
    anotar(ruta, lineaDe(texto, encontrado.index), 'localStorage fuera de shared/lib/storage.ts');
  }
}

// 5. Un componente por idea: el chip, el menú de fila y el estado vacío.
const COMPARTIDOS = [
  [/aria-haspopup="menu"/, 'menú propio: usa RowMenu de shared/ui'],
  [/border-radius:\s*999px/, 'chip propio: usa Chip de shared/ui'],
];
for (const ruta of [...archivos(RAIZ, '.tsx'), ...archivos(RAIZ, '.css')]) {
  if (ruta.startsWith(join('src', 'shared', 'ui'))) continue;
  const texto = readFileSync(ruta, 'utf8');
  for (const [patron, mensaje] of COMPARTIDOS) {
    const encontrado = patron.exec(texto);
    if (encontrado !== null) anotar(ruta, lineaDe(texto, encontrado.index), mensaje);
  }
}

if (fallos.length === 0) {
  console.log('Interfaz uniforme: modales y tablas con pie, alturas en la escala, componentes compartidos.');
} else {
  console.log(`${fallos.length} desvío(s) de la uniformidad:\n`);
  for (const fallo of fallos) console.log(`  ${fallo}`);
  process.exitCode = 1;
}
