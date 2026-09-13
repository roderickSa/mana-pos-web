// Recorre el módulo de Compras como lo recorre una persona: armar una orden a
// medias, dejarla, volver, cambiarla, crearla, recibir la mercadería, cancelar.
//
// Lo que se arma vive SOLO en este navegador hasta que se crea la orden. Así
// que el script mira las dos cosas: lo que quedó guardado acá y lo que quedó
// en el servidor. Los bugs que dolieron (líneas duplicadas, borradores que no
// se podían borrar, cantidades perdidas) no se ven en la pantalla, se ven en
// los datos.
//
//   npm run build && node scripts/probar-compras.mjs
import puppeteer from 'puppeteer-core';

const APP = process.env.MANA_APP ?? 'http://localhost:3210';
const PIN_DUENO = '2580';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// El borrador se manda al servidor 1,5 s después del último cambio.
const GUARDADO = 2600;

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

function seccion(titulo) {
  console.log(`\n${titulo}`);
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
  await esperar(1000);
}

// El botón del cuadro de arriba, cuando hay un modal sobre el formulario.
async function tocarArriba(pagina, texto) {
  await pagina.evaluate((buscado) => {
    const cuadros = [...document.querySelectorAll('[role="dialog"]')];
    const botones = [...(cuadros[cuadros.length - 1]?.querySelectorAll('button') ?? [])];
    (botones.find((n) => n.textContent.trim() === buscado) ??
      botones.find((n) => n.textContent.trim().includes(buscado)))?.click();
  }, texto);
  await esperar(1200);
}

const ruta = (pagina) => pagina.evaluate(() => location.pathname + location.search);
const texto = (pagina) => pagina.evaluate(() => document.body.innerText);
const pie = async (pagina) =>
  (await texto(pagina)).match(/Se guarda[^\n]*/)?.[0] ?? '(sin pie)';
const lineasEnPantalla = (pagina) =>
  pagina.evaluate(() => Number(document.body.innerText.match(/(\d+) productos? · S\//)?.[1] ?? '0'));

// La verdad está en el servidor, no en la pantalla.
// Los pedidos que hace ESTE script van marcados: algunos preguntan por cosas
// que acaban de borrarse y su 404 es la respuesta correcta, no una falla.
const api = (pagina, url, metodo = 'GET') =>
  pagina.evaluate(
    async (u, m) => {
      const token = localStorage.getItem('mana-pos-token');
      const r = await fetch(u, {
        method: m,
        headers: { authorization: `Bearer ${token}`, 'x-prueba': '1' },
      });
      if (r.status === 204) return null;
      return r.ok ? r.json() : { error: r.status };
    },
    url,
    metodo,
  );

const orden = (pagina, id) => api(pagina, `/purchases/orders/${id}`);
const borradores = async (pagina) => (await api(pagina, '/purchases/orders?status=draft&perPage=100')).items;
const idDeLaRuta = async (pagina) => (await ruta(pagina)).split('/')[3];
const hayBorradorLocal = (pagina) =>
  pagina.evaluate(
    () => Object.keys(localStorage).some((clave) => clave.startsWith('mana-pos:borrador-orden')),
  );

async function escribirEnCampo(pagina, indice, valor) {
  const campos = await pagina.$$('input[type="number"]');
  const campo = campos[indice];
  if (campo === undefined) return false;
  await campo.click({ clickCount: 3 });
  await pagina.keyboard.press('Backspace');
  if (valor !== '') await campo.type(valor);
  return true;
}

async function agregarProducto(pagina, busqueda) {
  const buscador = await pagina.$('input[placeholder*="busca" i]');
  if (buscador === null) return false;
  await buscador.click({ clickCount: 3 });
  await buscador.type(busqueda);
  await esperar(1300);
  await pagina.keyboard.press('Enter');
  await esperar(1200);
  // Si el producto no es de este proveedor, la app ofrece asociarlo al vuelo.
  const asociando = await pagina.evaluate(() =>
    document.body.innerText.includes('Asociar producto al proveedor'),
  );
  if (asociando) {
    await tocarArriba(pagina, 'Asociar');
    await esperar(1200);
  }
  return true;
}

const navegador = await puppeteer.launch({
  executablePath: process.env.MANA_CHROME ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});

try {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1366, height: 768 });
  pagina.on('pageerror', (error) => {
    fallados += 1;
    console.log(`  FALLA   error de página: ${String(error).slice(0, 130)}`);
  });
  // Un error de consola sin la URL no sirve para nada: se avisa con el pedido
  // que falló, que es lo que dice dónde mirar.
  pagina.on('response', (respuesta) => {
    if (respuesta.status() < 400) return;
    if (respuesta.request().headers()['x-prueba'] === '1') return;
    const url = new URL(respuesta.url()).pathname;
    fallados += 1;
    console.log(`  FALLA   ${respuesta.request().method()} ${url} respondió ${respuesta.status()}`);
  });
  pagina.on('dialog', (aviso) => aviso.accept());

  await pagina.goto(APP, { waitUntil: 'domcontentloaded' });
  await esperar(1400);
  for (const digito of PIN_DUENO) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);

  // ── Estados sucios ───────────────────────────────────────────────────
  // La tienda nunca arranca limpia. Esta tanda corre ANTES de borrar nada,
  // con lo que haya quedado de ayer: punteros viejos, borradores de otra PC,
  // órdenes que alguien confirmó mientras tanto. El bug que se nos escapó
  // («no puedo crear una orden») vivía exactamente acá, y no lo veíamos
  // porque el script limpiaba todo antes de empezar.
  seccion('0. Con lo que quedó de antes, la pantalla igual abre');
  await pagina.goto(`${APP}/compras/ordenes`, { waitUntil: 'domcontentloaded' });
  await esperar(1800);
  await tocar(pagina, '+ Nueva orden');
  await esperar(2800);
  comprobar(
    'se puede empezar una orden, haya lo que haya guardado',
    (await ruta(pagina)).includes('/compras/ordenes/nueva') ||
      /\/compras\/ordenes\/[^/]+\/editar/.test(await ruta(pagina)),
    await ruta(pagina),
  );
  comprobar('y el formulario está en pantalla', (await pagina.$('select')) !== null);

  // Una orden que YA NO es borrador (la confirmaron desde otra computadora).
  const yaConfirmada = (await api(pagina, '/purchases/orders?status=open&perPage=1')).items[0];
  if (yaConfirmada !== undefined) {
    await pagina.goto(`${APP}/compras/ordenes/${yaConfirmada.id}/editar`, {
      waitUntil: 'domcontentloaded',
    });
    await esperar(2800);
    comprobar(
      'editar una orden ya confirmada no deja la pantalla colgada',
      !(await ruta(pagina)).includes('/editar'),
      await ruta(pagina),
    );
  }

  // Arranca limpio: sin borradores viejos ni rastro en este navegador.
  for (const viejo of await borradores(pagina)) {
    await api(pagina, `/purchases/orders/${viejo.id}`, 'DELETE');
  }
  await pagina.evaluate(() => {
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith('mana-pos:borrador-orden') || clave.startsWith('mana-pos:recepcion')) {
        localStorage.removeItem(clave);
      }
    }
  });

  seccion('1. Armar una orden desde cero');
  await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  comprobar('empieza vacía', (await lineasEnPantalla(pagina)) === 0);
  const proveedores = await pagina.$$eval('select option', (nodos) =>
    nodos.map((nodo) => ({ value: nodo.value, label: nodo.textContent })).filter((o) => o.value),
  );
  await pagina.select('select', proveedores[0].value);
  await esperar(1200);
  comprobar('elegir proveedor no crea nada todavía', (await borradores(pagina)).length === 0);

  await agregarProducto(pagina, 'arroz');
  comprobar('el producto entra a la orden', (await lineasEnPantalla(pagina)) === 1);
  comprobar(
    'sin cantidad ni costo NO se guarda en el servidor',
    (await borradores(pagina)).length === 0,
    await pie(pagina),
  );

  seccion('2. Lo tecleado queda en esta computadora');
  await escribirEnCampo(pagina, 0, '3');
  await escribirEnCampo(pagina, 1, '12.50');
  await esperar(GUARDADO);
  comprobar('no se creó nada en el servidor', (await borradores(pagina)).length === 0);
  comprobar('el pie lo dice', (await pie(pagina)).includes('Se guarda'), await pie(pagina));
  comprobar('y quedó guardado acá', await hayBorradorLocal(pagina));

  seccion('3. Recargar no pierde nada');
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperar(2800);
  comprobar('vuelve la línea', (await lineasEnPantalla(pagina)) === 1, `vi ${await lineasEnPantalla(pagina)}`);
  comprobar(
    'vuelve el proveedor',
    (await pagina.$eval('select', (nodo) => nodo.value)) === proveedores[0].value,
  );
  comprobar(
    'y la cantidad tecleada',
    (await pagina.$$eval('input[type="number"]', (n) => n[0]?.value ?? '')) === '3',
  );

  seccion('4. Irse al listado y volver tampoco');
  await tocar(pagina, 'Órdenes');
  await esperar(1800);
  comprobar('no pregunta nada al salir', !(await texto(pagina)).includes('sin guardar'));
  comprobar('y sale de verdad', (await ruta(pagina)).endsWith('/compras/ordenes'), await ruta(pagina));
  await tocar(pagina, '+ Nueva orden');
  await esperar(2600);
  comprobar('al volver está todo', (await lineasEnPantalla(pagina)) === 1);

  seccion('5. Un segundo producto, y quitarlo');
  await agregarProducto(pagina, 'aceite');
  await escribirEnCampo(pagina, 2, '2');
  await escribirEnCampo(pagina, 3, '8.00');
  await esperar(GUARDADO);
  comprobar('quedan dos líneas', (await lineasEnPantalla(pagina)) === 2);
  await pagina.evaluate(() => {
    const quitar = [...document.querySelectorAll('button[aria-label^="Quitar"]')];
    quitar[quitar.length - 1]?.click();
  });
  await esperar(GUARDADO);
  comprobar('quitar una la quita', (await lineasEnPantalla(pagina)) === 1);
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperar(2800);
  comprobar('y sigue quitada tras recargar', (await lineasEnPantalla(pagina)) === 1);

  seccion('6. Vaciar una cantidad no rompe nada');
  await escribirEnCampo(pagina, 0, '');
  await esperar(GUARDADO);
  comprobar('la línea sigue ahí', (await lineasEnPantalla(pagina)) === 1);
  comprobar('el pie avisa qué falta', (await pie(pagina)).includes('falta'), await pie(pagina));
  await escribirEnCampo(pagina, 0, '9');
  await esperar(GUARDADO);
  comprobar('y al escribirla otra vez queda lista', !(await pie(pagina)).includes('falta'));

  seccion('7. Cambiar de proveedor vacía la orden, avisando');
  const otro = proveedores[1];
  if (otro !== undefined) {
    await pagina.select('select', otro.value);
    await esperar(1000);
    comprobar('pregunta antes de vaciar', (await texto(pagina)).includes('Cambiar de proveedor'));
    await tocarArriba(pagina, 'Cambiar y vaciar');
    await esperar(2000);
    comprobar('la orden queda vacía', (await lineasEnPantalla(pagina)) === 0);
    comprobar('y el proveedor es el nuevo', (await pagina.$eval('select', (n) => n.value)) === otro.value);
    await pagina.select('select', proveedores[0].value);
    await esperar(1000);
  }

  seccion('8. Descartar tira lo que se estaba armando');
  await agregarProducto(pagina, 'arroz');
  await escribirEnCampo(pagina, 0, '2');
  await escribirEnCampo(pagina, 1, '9.00');
  await esperar(GUARDADO);
  await tocar(pagina, 'Cancelar');
  await esperar(900);
  await tocarArriba(pagina, 'Sí, cancelar');
  await esperar(2000);
  comprobar('vuelve al listado', (await ruta(pagina)).startsWith('/compras/ordenes'), await ruta(pagina));
  comprobar('no quedó guardado acá', !(await hayBorradorLocal(pagina)));
  await tocar(pagina, '+ Nueva orden');
  await esperar(2400);
  comprobar('y el formulario abre limpio', (await lineasEnPantalla(pagina)) === 0);

  seccion('9. Crear la orden');
  // Se descartó recién: hay que volver a elegir proveedor.
  await pagina.select('select', proveedores[0].value);
  await esperar(1200);
  await agregarProducto(pagina, 'arroz');
  await escribirEnCampo(pagina, 0, '5');
  await escribirEnCampo(pagina, 1, '10.00');
  await esperar(GUARDADO);
  const antesDeCrear = (await api(pagina, '/purchases/orders?perPage=1')).total;
  await tocar(pagina, 'Crear orden');
  await esperar(2600);
  const listado = await api(pagina, '/purchases/orders?perPage=1');
  comprobar('la orden entra al listado', listado.total === antesDeCrear + 1, `${antesDeCrear} → ${listado.total}`);
  const creada = await orden(pagina, listado.items[0].id);
  comprobar('queda abierta', creada.status === 'open', creada.status);
  comprobar('con su línea', (creada.lines ?? []).length === 1);
  comprobar('sin dejar nada guardado acá', !(await hayBorradorLocal(pagina)));
  comprobar('y vuelve al listado', (await ruta(pagina)).startsWith('/compras/ordenes'), await ruta(pagina));

  seccion('9b. Guardar como borrador, y terminarla después');
  await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  await pagina.select('select', proveedores[0].value);
  await esperar(1200);
  await agregarProducto(pagina, 'arroz');
  await escribirEnCampo(pagina, 0, '8');
  await escribirEnCampo(pagina, 1, '11.00');
  await esperar(GUARDADO);
  await tocar(pagina, 'Guardar como borrador');
  await esperar(2600);
  const guardados = await borradores(pagina);
  comprobar('queda un borrador en el listado', guardados.length === 1, `había ${guardados.length}`);
  comprobar('y no quedó nada tecleado acá', !(await hayBorradorLocal(pagina)));

  // Se retoma desde el listado, se cambia algo y se crea.
  await pagina.goto(`${APP}/compras/ordenes/${guardados[0].id}/editar`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2800);
  comprobar('se abre con sus líneas', (await lineasEnPantalla(pagina)) === 1, `vi ${await lineasEnPantalla(pagina)}`);
  await escribirEnCampo(pagina, 0, '12');
  await esperar(600);
  await tocar(pagina, 'Guardar cambios');
  await esperar(2600);
  const editado = await orden(pagina, guardados[0].id);
  comprobar('guardar cambios los guarda', editado.lines?.[0]?.quantityOrdered === 12, JSON.stringify(editado.lines?.[0]?.quantityOrdered));
  comprobar('y sigue siendo borrador', editado.status === 'draft', editado.status);
  comprobar('sin duplicar líneas', (editado.lines ?? []).length === 1);

  await pagina.goto(`${APP}/compras/ordenes/${guardados[0].id}/editar`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2800);
  await tocar(pagina, 'Crear orden');
  await esperar(2600);
  const desdeElBorrador = await orden(pagina, guardados[0].id);
  comprobar('crear la orden desde el borrador la abre', desdeElBorrador.status === 'open', desdeElBorrador.status);
  comprobar('y ya no figura como borrador', (await borradores(pagina)).length === 0);

  seccion('10. Dos clics en «Crear orden» no crean dos');
  await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  await pagina.select('select', proveedores[0].value);
  await esperar(1000);
  await agregarProducto(pagina, 'arroz');
  await escribirEnCampo(pagina, 0, '2');
  await escribirEnCampo(pagina, 1, '7.00');
  await esperar(GUARDADO);
  const antesDeDoble = (await api(pagina, '/purchases/orders?perPage=1')).total;
  await pagina.evaluate(() => {
    const boton = [...document.querySelectorAll('button')].find(
      (nodo) => nodo.textContent.trim() === 'Crear orden',
    );
    boton?.click();
    boton?.click();
  });
  await esperar(3200);
  const despuesDeDoble = (await api(pagina, '/purchases/orders?perPage=1')).total;
  comprobar(
    'se creó una sola',
    despuesDeDoble === antesDeDoble + 1,
    `${antesDeDoble} → ${despuesDeDoble}`,
  );

  seccion('11. Los borradores viejos del servidor se pueden tirar');
  // Los que dejó la versión anterior (o un seed) se limpian desde el listado.
  const viejo = (
    await api(pagina, '/purchases/orders?perPage=1&status=draft')
  ).items[0];
  if (viejo === undefined) {
    comprobar('no quedan borradores viejos que limpiar', true);
  } else {
    await pagina.goto(`${APP}/compras/ordenes?borradores=true`, { waitUntil: 'domcontentloaded' });
    await esperar(2200);
    comprobar('el filtro los junta', (await texto(pagina)).includes('borrador'));
    await tocar(pagina, 'Descartar');
    await esperar(2000);
    comprobar('y se borran de una', (await orden(pagina, viejo.id)).error === 404);
  }

  seccion('12. Recibir mercadería');
  const abierta = (await api(pagina, '/purchases/orders?pending=true&perPage=1')).items[0];
  if (abierta === undefined) {
    comprobar('hay una orden pendiente para recibir', false, 'no había ninguna');
  } else {
    const antes = await orden(pagina, abierta.id);
    const pedido = antes.lines?.[0]?.quantityOrdered ?? 0;
    await pagina.goto(`${APP}/compras/ordenes/${abierta.id}`, { waitUntil: 'domcontentloaded' });
    await esperar(2200);
    await tocar(pagina, 'Recibir mercadería');
    await esperar(1400);
    const recibidos = await pagina.$$('input[type="number"]');
    if (recibidos[0] !== undefined) {
      await recibidos[0].click({ clickCount: 3 });
      await recibidos[0].type(String(Math.max(1, Math.floor(pedido / 2))));
    }
    await esperar(800);

    // Recargar a mitad de contar: lo tecleado y el id de la recepción vuelven.
    await pagina.reload({ waitUntil: 'domcontentloaded' });
    await esperar(2600);
    const guardadoLocal = await pagina.evaluate((id) => {
      const crudo = localStorage.getItem(`mana-pos:recepcion:${id}`);
      return crudo === null ? null : JSON.parse(crudo).data;
    }, abierta.id);
    comprobar('la recepción a medias queda guardada', guardadoLocal !== null);
    comprobar(
      'con su id de recepción, que es lo que evita duplicar stock',
      typeof guardadoLocal?.receptionId === 'string' && guardadoLocal.receptionId.length > 10,
    );

    await tocar(pagina, 'Recibir mercadería');
    await esperar(1600);
    await tocar(pagina, 'Confirmar recepción');
    await esperar(2600);
    const parcial = await orden(pagina, abierta.id);
    // Parcial si quedó algo por traer, recibida si entró todo: las dos son
    // desenlaces válidos según lo que se haya pedido.
    comprobar(
      'la orden deja de estar abierta',
      parcial.status === 'partial' || parcial.status === 'received',
      parcial.status,
    );
    comprobar('con una recepción anotada', parcial.receptions.length === 1, `tenía ${parcial.receptions.length}`);
    comprobar(
      'el borrador de recepción se borró al recibir',
      await pagina.evaluate((id) => localStorage.getItem(`mana-pos:recepcion:${id}`) === null, abierta.id),
    );
  }

  seccion('13. Cancelar una orden ya enviada la deja en la historia');
  // Abierta, no parcial: una orden que ya recibió algo no se cancela, se
  // cierra anticipadamente. Eso es a propósito.
  const paraCancelar = (await api(pagina, '/purchases/orders?status=open&perPage=1')).items[0];
  if (paraCancelar !== undefined) {
    await pagina.goto(`${APP}/compras/ordenes/${paraCancelar.id}`, { waitUntil: 'domcontentloaded' });
    await esperar(2200);
    // El menú ⋯ del encabezado del detalle.
    await pagina.evaluate(() => {
      document.querySelector('[role="dialog"] button[aria-haspopup="menu"]')?.click();
    });
    await esperar(700);
    await pagina.evaluate(() => {
      [...document.querySelectorAll('[role="menuitem"]')]
        .find((n) => n.textContent.includes('Cancelar orden'))
        ?.click();
    });
    await esperar(1000);
    await tocarArriba(pagina, 'Cancelar orden');
    await esperar(2200);
    const cancelada = await orden(pagina, paraCancelar.id);
    comprobar(
      'sigue existiendo, marcada como cancelada',
      cancelada.status === 'cancelled',
      JSON.stringify(cancelada.status ?? cancelada).slice(0, 40),
    );
  }

  seccion('14. Recargar a mitad de armarla');
  // Recargar en cada etapa del armado: con proveedor elegido y con una línea
  // a medias. Es lo que pasa cuando se corta la luz o alguien toca F5.
  await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  await pagina.select('select', proveedores[0].value);
  await esperar(1200);
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperar(2600);
  comprobar(
    'recargar con el proveedor elegido lo conserva',
    (await pagina.$eval('select', (s) => s.value)) === proveedores[0].value,
  );
  await agregarProducto(pagina, 'arroz');
  await escribirEnCampo(pagina, 0, '4');
  await esperar(1200);
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperar(2800);
  comprobar(
    'recargar con una línea sin costo la conserva',
    (await lineasEnPantalla(pagina)) === 1,
    `vi ${await lineasEnPantalla(pagina)}`,
  );
  comprobar(
    'y esa línea a medias no llegó al servidor',
    (await borradores(pagina)).length === 0,
    await pie(pagina),
  );
  // Se limpia lo que quedó tecleado para no ensuciar el siguiente paso.
  await pagina.evaluate(() => {
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith('mana-pos:borrador-orden')) localStorage.removeItem(clave);
    }
  });

  seccion('15. Sugerir bajo mínimo mira TODO el catálogo del proveedor');
  // El bug real: el botón pedía la lista sin paginar (50 productos ordenados
  // por venta) y filtraba en el navegador, así que un proveedor con 250
  // productos escondía casi todos sus faltantes. Se compara contra lo que el
  // servidor dice que está bajo mínimo, no contra una página.
  const conFaltantes = [];
  for (const proveedor of proveedores) {
    const bajos = await api(
      pagina,
      `/catalog/products?supplier=${proveedor.value}&lowStock=true&page=1&perPage=100`,
    );
    if ((bajos.items?.length ?? 0) > 0) conFaltantes.push({ proveedor, bajos: bajos.items });
  }
  comprobar('hay algún proveedor con productos bajo mínimo para probar', conFaltantes.length > 0);
  if (conFaltantes.length > 0) {
    // El peor caso primero: el que más faltantes tiene.
    conFaltantes.sort((a, b) => b.bajos.length - a.bajos.length);
    const { proveedor, bajos } = conFaltantes[0];
    await pagina.goto(`${APP}/compras/ordenes/nueva`, { waitUntil: 'domcontentloaded' });
    await esperar(2000);
    await pagina.select('select', proveedor.value);
    await esperar(1400);
    await tocar(pagina, 'Sugerir bajo mínimo');
    await esperar(2600);
    comprobar(
      'trae todos los que el servidor marca bajo mínimo',
      (await lineasEnPantalla(pagina)) === bajos.length,
      `esperaba ${bajos.length} y vi ${await lineasEnPantalla(pagina)} (${proveedor.label})`,
    );
    const enPantalla = await texto(pagina);
    const faltante = bajos.find((producto) => !enPantalla.includes(producto.name));
    comprobar(
      'ninguno queda fuera, aunque no esté en la primera página',
      faltante === undefined,
      faltante?.name,
    );
    // Se descarta lo sugerido: nada de esto debe sobrevivir a la prueba.
    await pagina.evaluate(() => {
      for (const clave of Object.keys(localStorage)) {
        if (clave.startsWith('mana-pos:borrador-orden')) localStorage.removeItem(clave);
      }
    });
  }

  seccion('16. Nada quedó a medio camino');
  comprobar('no quedan borradores sueltos', (await borradores(pagina)).length === 0);
} finally {
  await navegador.close();
}

console.log(`\n${pasados} bien · ${fallados} mal`);
process.exitCode = fallados === 0 ? 0 : 1;
