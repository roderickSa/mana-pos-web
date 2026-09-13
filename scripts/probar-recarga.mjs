// Prueba lo que ningún test unitario puede: que recargar la página deje al
// usuario donde estaba, con lo que estaba haciendo. Se corre contra la app de
// verdad servida por la API en :3210.
//
//   npm run build && node scripts/probar-recarga.mjs
//
// Cada paso dice qué tanda lo habilita. Los de tandas que todavía no se
// implementaron se saltan con un aviso, no fallan.
import puppeteer from 'puppeteer-core';

const APP = process.env.MANA_APP ?? 'http://localhost:3210';
const PIN_ENCARGADO = '1379';
const PIN_CAJERA = '2468';
// Qué tandas están implementadas: no van en orden, la 4 se adelantó a la 3.
// Agregar un número acá habilita sus pasos.
const HECHAS = new Set(
  (process.env.MANA_TANDAS ?? '1,2,3,4').split(',').map((valor) => Number(valor.trim())),
);
const hecha = (tanda) => HECHAS.has(tanda);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pasados = 0;
let fallados = 0;
let salteados = 0;

function comprobar(nombre, condicion, detalle) {
  if (condicion) {
    pasados += 1;
    console.log(`  ok      ${nombre}`);
    return;
  }
  fallados += 1;
  console.log(`  FALLA   ${nombre}${detalle === undefined ? '' : ` — ${detalle}`}`);
}

function saltear(nombre, tanda) {
  salteados += 1;
  console.log(`  (salta) ${nombre} — llega con la tanda ${tanda}`);
}

async function abrir(navegador) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1366, height: 768 });
  pagina.on('pageerror', (error) => {
    fallados += 1;
    console.log(`  FALLA   error de página: ${String(error).slice(0, 120)}`);
  });
  // Con cambios sin guardar el navegador pregunta antes de recargar. Acá
  // siempre se acepta salir: lo que se prueba es qué queda guardado después.
  pagina.on('dialog', (aviso) => aviso.accept());
  return pagina;
}

async function tocar(pagina, texto, indice = 0) {
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
  await esperar(1100);
}

// Con el aviso de cambios sin guardar abierto hay dos «Descartar» en pantalla:
// el del aviso y el de la franja de borrador que quedó atrás. Este toca el del
// cuadro de arriba, que es el que la persona ve.
async function tocarArriba(pagina, texto) {
  await pagina.evaluate((buscado) => {
    const cuadros = [...document.querySelectorAll('[role="dialog"]')];
    const arriba = cuadros[cuadros.length - 1];
    const botones = [...(arriba?.querySelectorAll('button') ?? [])];
    (botones.find((nodo) => nodo.textContent.trim() === buscado) ?? botones.find((nodo) => nodo.textContent.trim().includes(buscado)))?.click();
  }, texto);
  await esperar(1100);
}

const cuadros = (pagina) => pagina.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
const primerCampo = (pagina) =>
  pagina.evaluate(() => document.querySelector('[role="dialog"] input')?.value ?? '');

async function entrar(pagina, pin) {
  await pagina.goto(APP, { waitUntil: 'networkidle2' });
  await esperar(700);
  for (const digito of pin) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);
}

async function salir(pagina) {
  await pagina.evaluate(() => localStorage.clear());
}

const ruta = (pagina) => pagina.evaluate(() => location.pathname + location.search);
const recargar = async (pagina) => {
  await pagina.reload({ waitUntil: 'networkidle2' });
  await esperar(1900);
};

const navegador = await puppeteer.launch({
  executablePath: process.env.MANA_CHROME ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});

try {
  const pagina = await abrir(navegador);
  await entrar(pagina, PIN_ENCARGADO);

  console.log('\n1. La sección y la subpestaña sobreviven a la recarga');
  await tocar(pagina, 'Inventario');
  await tocar(pagina, 'Kardex');
  const enKardex = await ruta(pagina);
  await recargar(pagina);
  comprobar('sigue en Kardex', (await ruta(pagina)).startsWith('/inventario/kardex'), await ruta(pagina));
  comprobar('la URL no cambió', (await ruta(pagina)) === enKardex);

  console.log('\n2. La búsqueda y la página sobreviven a la recarga');
  await tocar(pagina, 'Productos');
  await pagina.type('input[placeholder*="Buscar" i]', 'arroz');
  await esperar(1300);
  await tocar(pagina, 'Siguiente');
  const conFiltro = await ruta(pagina);
  await recargar(pagina);
  const busqueda = await pagina.$eval('input[placeholder*="Buscar" i]', (campo) => campo.value);
  comprobar('la búsqueda vuelve escrita', busqueda === 'arroz', `decía "${busqueda}"`);
  comprobar('la página se mantiene', (await ruta(pagina)) === conFiltro, await ruta(pagina));

  console.log('\n3. Un modal abierto sobrevive a la recarga');
  if (!hecha(4)) {
    saltear('el modal de editar producto sigue abierto', 4);
  } else {
    await tocar(pagina, 'Acciones');
    await tocar(pagina, 'Editar producto');
    const conModal = await ruta(pagina);
    comprobar('la URL trae el id del producto', /\/productos\/[^/]+\/editar/.test(conModal), conModal);
    comprobar('y conserva los filtros del listado', conModal.includes('q=arroz'), conModal);
    await recargar(pagina);
    comprobar('el modal sigue abierto', (await pagina.$('[role="dialog"]')) !== null);
    comprobar('con la misma URL', (await ruta(pagina)) === conModal);
    await pagina.keyboard.press('Escape');
    await esperar(700);
    comprobar('cerrar vuelve al listado con su búsqueda', (await ruta(pagina)).includes('q=arroz'), await ruta(pagina));

    // Un id que ya no existe no deja la pantalla a medias.
    await pagina.goto(`${APP}/productos/no-existe/editar`, { waitUntil: 'networkidle2' });
    await esperar(2200);
    comprobar('un id inventado devuelve al listado', (await ruta(pagina)) === '/productos', await ruta(pagina));
  }

  console.log('\n4. La orden a medio armar sobrevive a la recarga');
  if (!hecha(3)) {
    saltear('la orden conserva sus líneas', 3);
    saltear('la orden sigue ahí al volver de otra pestaña', 3);
  } else {
    await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
    await esperar(2000);
    const opciones = await pagina.$$eval('select option', (nodos) =>
      nodos.map((nodo) => nodo.value).filter(Boolean),
    );
    await pagina.select('select', opciones[0]);
    await esperar(1200);
    const buscador = await pagina.$('input[placeholder*="busca" i]');
    if (buscador !== null) {
      await buscador.type('arroz');
      await esperar(1400);
      await pagina.keyboard.press('Enter');
      await esperar(1200);
    }
    // Cantidad y costo: el servidor no guarda una línea a medias, así que el
    // borrador nace recién cuando el renglón está completo.
    const campos = await pagina.$$('input[type="number"]');
    if (campos[0] !== undefined) {
      await campos[0].click({ clickCount: 3 });
      await campos[0].type('3');
    }
    if (campos[1] !== undefined) {
      await campos[1].click({ clickCount: 3 });
      await campos[1].type('12.50');
    }
    // El primer renglón completo hace nacer la orden en el servidor.
    await esperar(3000);
    const enFormulario = await ruta(pagina);
    comprobar(
      'el primer producto crea el borrador y la URL le pone id',
      /\/compras\/ordenes\/[^/]+\/editar/.test(enFormulario),
      enFormulario,
    );
    comprobar(
      'el pie dice que está guardado',
      await pagina.evaluate(() => document.body.innerText.includes('Guardado')),
    );

    await recargar(pagina);
    comprobar('sigue en el formulario', (await ruta(pagina)) === enFormulario, await ruta(pagina));
    const lineas = await pagina.evaluate(
      () => document.body.innerText.match(/(\d+) productos? · S\//)?.[1] ?? '0',
    );
    comprobar('con sus líneas', Number(lineas) > 0, `tenía ${lineas}`);

    console.log('\n5. La orden sobrevive a irse y volver');
    await tocar(pagina, 'Proveedores');
    await esperar(900);
    await pagina.goto(`${APP}${enFormulario}`, { waitUntil: 'domcontentloaded' });
    await esperar(2500);
    const vuelta = await pagina.evaluate(
      () => document.body.innerText.match(/(\d+) productos? · S\//)?.[1] ?? '0',
    );
    comprobar('la orden sigue ahí', Number(vuelta) > 0, `tenía ${vuelta}`);

    // Con el borrador en curso, pedir «nueva orden» devuelve a ese mismo
    // borrador en vez de arrancar de cero.
    await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
    await esperar(2500);
    comprobar(
      'pedir otra orden devuelve a la que quedó a medias',
      (await ruta(pagina)) === enFormulario,
      await ruta(pagina),
    );

    // Sin rastro en este navegador (otra PC, otro día), el borrador del
    // servidor se ofrece para retomarlo.
    await pagina.evaluate(() => {
      for (const clave of Object.keys(localStorage)) {
        if (clave.startsWith('mana-pos:borrador-orden:')) localStorage.removeItem(clave);
      }
    });
    await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
    await esperar(2500);
    comprobar(
      'desde otro navegador ofrece retomar el borrador',
      await pagina.evaluate(() => document.body.innerText.includes('Retomar')),
    );
    await tocar(pagina, 'Retomar');
    await esperar(1800);
    comprobar('retomar abre ese borrador', (await ruta(pagina)) === enFormulario, await ruta(pagina));

    // Se cancela para no dejar basura en la base de la demo.
    await tocar(pagina, 'Cancelar');
    await esperar(900);
    await tocar(pagina, 'Sí, cancelar');
    await esperar(1500);
    comprobar(
      'cancelar vuelve al listado de órdenes',
      (await ruta(pagina)).startsWith('/compras/ordenes'),
      await ruta(pagina),
    );
  }

  console.log('\n6. El bloqueo con F10 no mueve de pantalla');
  await tocar(pagina, 'Inventario');
  await tocar(pagina, 'Por vencer');
  const antesDeBloquear = await ruta(pagina);
  await pagina.keyboard.press('F10');
  await esperar(1200);
  for (const digito of PIN_ENCARGADO) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);
  comprobar('vuelve a la misma pantalla', (await ruta(pagina)) === antesDeBloquear, await ruta(pagina));

  console.log('\n   Entrar con otra persona sí lleva a su inicio');
  await pagina.keyboard.press('F10');
  await esperar(1200);
  for (const digito of PIN_CAJERA) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);
  comprobar('la cajera arranca en Vender', (await ruta(pagina)) === '/vender', await ruta(pagina));

  console.log('\n7. Una pantalla sin permiso redirige, no queda en blanco');
  await pagina.goto(`${APP}/compras/ordenes`, { waitUntil: 'networkidle2' });
  await esperar(1800);
  comprobar('la cajera termina en Vender', (await ruta(pagina)) === '/vender', await ruta(pagina));

  console.log('\n8. Atrás del navegador se queda dentro de la app');
  await salir(pagina);
  await entrar(pagina, PIN_ENCARGADO);
  await tocar(pagina, 'Clientes');
  await tocar(pagina, 'Productos');
  await pagina.goBack({ waitUntil: 'networkidle2' });
  await esperar(1400);
  const atras = await ruta(pagina);
  comprobar('vuelve a la pantalla anterior', atras.startsWith('/clientes'), atras);
  comprobar('sigue dentro de la app', (await pagina.$('nav')) !== null);

  console.log('\n9. Cerrar un formulario con cambios avisa');
  if (!hecha(2)) {
    saltear('aparece el aviso de cambios sin guardar', 2);
  } else {
    // Arranca limpio: un borrador de una corrida anterior cambiaría lo que se ve.
    await pagina.evaluate(() => {
      for (const clave of Object.keys(localStorage)) {
        if (clave.startsWith('mana-pos:borrador:')) localStorage.removeItem(clave);
      }
    });
    await pagina.goto(`${APP}/productos`, { waitUntil: 'networkidle2' });
    await esperar(1600);
    await tocar(pagina, '+ Nuevo producto');
    await pagina.keyboard.type('Producto a medias');
    await esperar(600);

    await pagina.keyboard.press('Escape');
    await esperar(800);
    comprobar(
      'avisa antes de descartar',
      await pagina.evaluate(() => document.body.innerText.includes('Tenés cambios sin guardar')),
    );

    await tocarArriba(pagina, 'Volver');
    comprobar(
      'seguir editando deja el texto donde estaba',
      (await primerCampo(pagina)) === 'Producto a medias',
      `decía "${await primerCampo(pagina)}"`,
    );

    await pagina.keyboard.press('Escape');
    await esperar(700);
    await tocarArriba(pagina, 'Descartar');
    comprobar('descartar cierra el formulario', (await cuadros(pagina)) === 0);

    // Descartar es descartar: al reabrir no debe ofrecer recuperar lo tirado.
    await tocar(pagina, '+ Nuevo producto');
    comprobar(
      'lo descartado no vuelve a ofrecerse',
      !(await pagina.evaluate(() => document.body.innerText.includes('Tenías cambios sin guardar'))),
    );
    await pagina.keyboard.press('Escape');
    await esperar(700);
    comprobar('sin cambios cierra sin preguntar', (await cuadros(pagina)) === 0);

    console.log('\n   Lo tecleado en el formulario se puede recuperar tras recargar');
    await tocar(pagina, '+ Nuevo producto');
    await pagina.keyboard.type('Queso paria');
    await esperar(700);
    await recargar(pagina);
    await tocar(pagina, '+ Nuevo producto');
    comprobar(
      'ofrece recuperar el borrador',
      await pagina.evaluate(() => document.body.innerText.includes('Tenías cambios sin guardar')),
    );
    await tocarArriba(pagina, 'Recuperar');
    comprobar(
      'recuperar devuelve lo tecleado',
      (await primerCampo(pagina)) === 'Queso paria',
      `decía "${await primerCampo(pagina)}"`,
    );
    await pagina.keyboard.press('Escape');
    await esperar(700);
    await tocarArriba(pagina, 'Descartar');
  }

  console.log('\n10. Lo tecleado en un conteo sobrevive a la recarga');
  if (!hecha(4)) {
    saltear('las cantidades tecleadas vuelven', 4);
  } else {
    await tocar(pagina, 'Inventario');
    await tocar(pagina, 'Conteo');
    await tocar(pagina, 'Empezar conteo');
    await esperar(1400);
    const campos = await pagina.$$('table tbody tr input');
    if (campos[0] !== undefined) await campos[0].type('7');
    await esperar(600);
    await recargar(pagina);
    const valor = await pagina.evaluate(
      () => document.querySelector('table tbody tr input')?.value ?? '',
    );
    comprobar('la cantidad sigue tecleada', valor === '7', `decía "${valor}"`);
    await tocar(pagina, 'Descartar');
    await esperar(700);
    await tocar(pagina, 'Descartar conteo');
    await esperar(700);
  }
} finally {
  await navegador.close();
}

console.log(
  `\n${pasados} bien · ${fallados} mal · ${salteados} por implementar`,
);
process.exitCode = fallados === 0 ? 0 : 1;
