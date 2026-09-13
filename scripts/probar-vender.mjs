// Recorre la pantalla de Vender como lo haría una cajera, en el navegador de
// verdad, y comprueba lo que ningún test unitario ve: que el producto entre al
// ticket, que el total cuadre, que los atajos respondan, que el ticket
// sobreviva a una recarga y que cobrar deje la caja como corresponde.
//
//   npm run build && node scripts/probar-vender.mjs
//
// Trabaja sobre la base de demo: crea ventas de verdad. No correrlo contra la
// base de la tienda.
import puppeteer from 'puppeteer-core';

const APP = process.env.MANA_APP ?? 'http://localhost:3210';
const PIN = process.env.MANA_PIN ?? '1379';

// Productos de la demo. Si el seed cambia, cambian acá.
const POR_UNIDAD = 'Concordia Naranja';
const PESABLE = 'Naranja de Mesa';
const OTRO_PESABLE = 'Beterraga';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pasados = 0;
let fallados = 0;

function comprobar(nombre, condicion, detalle) {
  if (condicion) {
    pasados += 1;
    console.log(`  ok      ${nombre}`);
    return;
  }
  fallados += 1;
  console.log(`  FALLA   ${nombre}${detalle === undefined ? '' : ` — ${detalle}`}`);
}

const navegador = await puppeteer.launch({
  executablePath: process.env.MANA_CHROME ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1366, height: 768 });
pagina.on('pageerror', (error) => {
  fallados += 1;
  console.log(`  FALLA   error de página: ${String(error).slice(0, 120)}`);
});

async function tocar(texto, indice = 0) {
  await pagina.evaluate(
    (buscado, i) => {
      const todos = [...document.querySelectorAll('button, a')];
      const exactos = todos.filter((nodo) => nodo.textContent.trim() === buscado);
      const elegido = exactos[i] ?? todos.filter((nodo) => nodo.textContent.trim().includes(buscado))[i];
      elegido?.click();
    },
    texto,
    indice,
  );
  await esperar(900);
}

// Lo que se ve del ticket, sin depender de las clases de CSS. Ojo: el
// contenedor se llama `lineas` y cada fila `linea`, así que hay que excluirlo
// o cuenta de más.
const FILAS = '[class*="_linea_"]';

const ticket = () =>
  pagina.evaluate((selector) => {
    const texto = document.body.innerText;
    const filas = [...document.querySelectorAll(selector)]
      .map((nodo) => nodo.innerText.replace(/\n+/g, ' · ').trim())
      .filter((fila) => fila.length > 0);
    return {
      // Se cuentan las filas del ticket, no el rótulo: al quitar una línea el
      // rótulo cede su lugar al botón Deshacer y deja de mostrar el número.
      lineas: filas.length,
      total: texto.match(/TOTAL\s*\n?\s*(S\/\s*[\d.]+)/)?.[1]?.replace(/\s+/g, ' ') ?? '?',
      filas,
      enEspera: Number(texto.match(/Retomar \((\d+)\)/)?.[1] ?? '0'),
    };
  }, FILAS);

const hayModal = () => pagina.evaluate(() => document.querySelector('[role="dialog"]') !== null);

const tituloModal = () =>
  pagina.evaluate(() => document.querySelector('[role="dialog"] h3')?.textContent.trim() ?? '');

async function pesar(gramos) {
  await pagina.keyboard.type(String(gramos));
  await esperar(300);
  await tocar('Agregar');
}

// La ✕ de una línea del ticket, no la de la leyenda del pie ni la de un modal.
async function quitarPrimeraLinea() {
  await pagina.evaluate((selector) => {
    const linea = document.querySelector(selector);
    const cerrar = [...(linea?.querySelectorAll('button') ?? [])].find(
      (boton) => boton.textContent.trim() === '✕',
    );
    cerrar?.click();
  }, FILAS);
  await esperar(800);
}

// El buscador acepta atajos: «3*» fija el multiplicador al enviarlo.
async function escribirEnBuscador(texto) {
  await pagina.evaluate((valor) => {
    const campo = document.querySelector('input[placeholder*="Escanea" i]');
    campo?.focus();
    campo.value = valor;
    campo?.dispatchEvent(new Event('input', { bubbles: true }));
  }, texto);
  await esperar(400);
  await pagina.keyboard.press('Enter');
  await esperar(800);
}

async function ticketLimpio() {
  await pagina.evaluate(() => localStorage.removeItem('mana-pos-venta'));
  await pagina.reload({ waitUntil: 'networkidle2' });
  await esperar(1800);
}

try {
  await pagina.goto(APP, { waitUntil: 'networkidle2' });
  await esperar(700);
  for (const digito of PIN) await tocar(digito);
  await tocar('✓');
  await esperar(2400);
  await ticketLimpio();

  console.log('\n1. Un producto por unidad suma en la misma línea');
  await tocar(POR_UNIDAD);
  await tocar(POR_UNIDAD);
  await tocar(POR_UNIDAD);
  let estado = await ticket();
  comprobar('queda una sola línea', estado.lineas === 1, `había ${estado.lineas}`);
  comprobar('con cantidad 3', estado.filas.some((fila) => / 3 /.test(fila)), estado.filas[0]);

  console.log('\n2. Un pesable abre la balanza y suma los kilos en la misma línea');
  await ticketLimpio();
  await tocar(PESABLE);
  comprobar('pide el peso antes de agregar', await hayModal());
  comprobar('el modal es el del producto', (await tituloModal()).includes('Naranja'), await tituloModal());
  await pesar(500);
  await tocar(PESABLE);
  await pesar(500);
  await tocar(PESABLE);
  await pesar(500);
  estado = await ticket();
  comprobar('queda una sola línea', estado.lineas === 1, `había ${estado.lineas}`);
  comprobar('con el kilo y medio sumado', estado.filas.some((fila) => /1\.500 kg/.test(fila)), estado.filas[0]);
  comprobar('y cobra los tres pesajes juntos', estado.total.includes('5.90') || estado.total.includes('5.85'), estado.total);

  console.log('\n3. Otro pesable distinto va en su propia línea');
  await tocar(OTRO_PESABLE);
  await pesar(400);
  estado = await ticket();
  comprobar('ahora hay dos líneas', estado.lineas === 2, `había ${estado.lineas}`);

  console.log('\n4. El ticket sobrevive a una recarga');
  const antes = await ticket();
  await pagina.reload({ waitUntil: 'networkidle2' });
  await esperar(1800);
  const despues = await ticket();
  comprobar('mismas líneas', despues.lineas === antes.lineas, `${antes.lineas} → ${despues.lineas}`);
  comprobar('mismo total', despues.total === antes.total, `${antes.total} → ${despues.total}`);

  console.log('\n5. Quitar y deshacer');
  await quitarPrimeraLinea();
  const trasQuitar = await ticket();
  comprobar('la línea se fue', trasQuitar.lineas === antes.lineas - 1, `quedaron ${trasQuitar.lineas}`);
  await pagina.keyboard.down('Control');
  await pagina.keyboard.press('KeyZ');
  await pagina.keyboard.up('Control');
  await esperar(800);
  const trasDeshacer = await ticket();
  comprobar('deshacer la devuelve', trasDeshacer.lineas === antes.lineas, `quedaron ${trasDeshacer.lineas}`);

  console.log('\n6. El multiplicador ×3 no se aplica a un pesable');
  await ticketLimpio();
  await escribirEnBuscador('3*');
  await tocar(PESABLE);
  comprobar('igual pide el peso', await hayModal());
  await pesar(1000);
  estado = await ticket();
  comprobar('agrega el kilo pesado, no tres', estado.filas.some((fila) => /1\.000 kg/.test(fila)), estado.filas[0]);

  console.log('\n7. Ticket en espera y volver a él');
  await ticketLimpio();
  await tocar(POR_UNIDAD);
  const conProducto = await ticket();
  await tocar('En espera');
  await esperar(900);
  const enEspera = await ticket();
  comprobar('el ticket se guarda y la venta queda vacía', enEspera.lineas === 0, `quedaron ${enEspera.lineas}`);
  comprobar('y aparece contado en el botón', enEspera.enEspera >= 1, `decía ${enEspera.enEspera}`);
  await tocar('Retomar');
  await esperar(900);
  const retomado = await ticket();
  comprobar('vuelve con sus líneas', retomado.lineas === conProducto.lineas, `quedaron ${retomado.lineas}`);

  console.log('\n8. Descuento a la línea');
  await ticketLimpio();
  await tocar(POR_UNIDAD);
  await tocar('%', 0);
  await esperar(800);
  comprobar('abre el descuento', (await tituloModal()).toLowerCase().includes('descuento'), await tituloModal());
  await pagina.keyboard.press('Escape');
  await esperar(600);

  console.log('\n9. Consulta de precio no toca el ticket');
  const previo = await ticket();
  await pagina.keyboard.press('F8');
  await esperar(900);
  comprobar('abre la consulta', (await tituloModal()).toLowerCase().includes('precio'), await tituloModal());
  await pagina.keyboard.press('Escape');
  await esperar(700);
  const posterior = await ticket();
  comprobar('el ticket quedó igual', posterior.lineas === previo.lineas, `${previo.lineas} → ${posterior.lineas}`);

  console.log('\n10. Cobrar en efectivo cierra la venta y abre una nueva');
  const estadoCaja = await pagina.evaluate(() =>
    document.body.innerText.includes('La caja está cerrada') ? 'cerrada' : 'abierta',
  );
  if (estadoCaja === 'cerrada') {
    console.log('  (salta) la caja está cerrada: el cobro se prueba con caja abierta');
  } else {
    await tocar('Cobrar en efectivo');
    await esperar(900);
    comprobar('abre el cobro', (await tituloModal()).toLowerCase().includes('cobrar'), await tituloModal());
    await tocar('Exacto');
    await esperar(600);
    await tocar('Cobrar S/');
    await esperar(1800);
    const cobrado = await pagina.evaluate(() => document.body.innerText.includes('cobrada'));
    comprobar('avisa que la venta se cobró', cobrado);
    await tocar('Listo');
    await esperar(1200);
    const nueva = await ticket();
    comprobar('el ticket queda vacío para el siguiente cliente', nueva.lineas === 0, `quedaron ${nueva.lineas}`);
  }

  await ticketLimpio();
} finally {
  await navegador.close();
}

console.log(`\n${pasados} bien · ${fallados} mal`);
process.exitCode = fallados === 0 ? 0 : 1;
