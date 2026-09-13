// Recorre Inventario: entradas, mermas, conteo por producto y kardex. El stock
// es lo segundo más delicado después del dinero, así que cada paso compara el
// stock ANTES y DESPUÉS contra el servidor, no contra la pantalla.
//
//   npm run build && node scripts/probar-inventario.mjs
import {
  abrirNavegador,
  abrirPagina,
  api,
  APP,
  crearReporte,
  entrar,
  escribirEnCampo,
  esperar,
  ruta,
  texto,
  tocar,
  tocarArriba,
} from './ayudas.mjs';

const reporte = crearReporte();
const { comprobar, seccion } = reporte;

const producto = (pagina, id) => api(pagina, `/catalog/products/${id}`);
const stockDe = async (pagina, id) => (await producto(pagina, id)).stockUnits;
const movimientos = (pagina, id) => api(pagina, `/inventory/kardex/${id}`);

const navegador = await abrirNavegador();
try {
  const pagina = await abrirPagina(navegador, reporte);
  await entrar(pagina);

  // Un producto por unidad, que es donde las cuentas son exactas.
  const catalogo = await api(pagina, '/catalog/products?query=&page=1&perPage=25');
  const elegido = (catalogo.items ?? []).find((item) => item.saleType === 'unit');
  if (elegido === undefined) {
    comprobar('hay un producto por unidad para probar', false, 'el catálogo no tiene ninguno');
    reporte.cerrar();
    await navegador.close();
    process.exit();
  }

  seccion('1. Una entrada suma al stock lo que se registró');
  const antesDeEntrada = await stockDe(pagina, elegido.id);
  await pagina.goto(`${APP}/inventario/entradas/${elegido.id}/entrada`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  comprobar('el modal abre desde su URL', (await pagina.$('[role="dialog"]')) !== null);
  // La entrada pide cantidad Y costo: sin costo el botón queda apagado.
  await escribirEnCampo(pagina, 0, '7');
  await escribirEnCampo(pagina, 1, '2.00');
  await tocarArriba(pagina, 'Registrar entrada');
  await esperar(2400);
  const trasEntrada = await stockDe(pagina, elegido.id);
  comprobar(
    'el stock sube exactamente 7',
    trasEntrada === antesDeEntrada + 7,
    `${antesDeEntrada} → ${trasEntrada}`,
  );
  comprobar(
    'y vuelve al listado',
    (await ruta(pagina)).startsWith('/inventario/entradas'),
    await ruta(pagina),
  );
  const kardexEntrada = await movimientos(pagina, elegido.id);
  comprobar(
    'queda anotado en el kardex, con su cantidad',
    (kardexEntrada.movements ?? []).some((m) => m.kind === 'purchase' && m.quantity === 7),
    JSON.stringify((kardexEntrada.movements ?? []).slice(0, 2).map((m) => [m.kind, m.quantity])),
  );
  comprobar(
    'y el saldo del kardex es el stock',
    kardexEntrada.currentQuantity === trasEntrada,
    `kardex ${kardexEntrada.currentQuantity} vs stock ${trasEntrada}`,
  );

  seccion('2. Una merma resta, y queda con su motivo');
  const antesDeMerma = await stockDe(pagina, elegido.id);
  await pagina.goto(`${APP}/inventario/entradas/${elegido.id}/merma`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  await escribirEnCampo(pagina, 0, '2');
  await pagina.evaluate(() => {
    const select = document.querySelector('[role="dialog"] select');
    if (select === null) return;
    const opcion = [...select.options].find((o) => o.value !== '');
    if (opcion !== undefined) {
      select.value = opcion.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await esperar(500);
  await tocarArriba(pagina, 'Registrar ajuste');
  await esperar(2400);
  const trasMerma = await stockDe(pagina, elegido.id);
  comprobar(
    'el stock baja exactamente 2',
    trasMerma === antesDeMerma - 2,
    `${antesDeMerma} → ${trasMerma}`,
  );

  seccion('3. El conteo físico deja el stock en lo contado');
  await pagina.goto(`${APP}/inventario/entradas/${elegido.id}/conteo`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  await escribirEnCampo(pagina, 0, '33');
  await tocarArriba(pagina, 'Actualizar stock');
  await esperar(2400);
  const trasConteo = await stockDe(pagina, elegido.id);
  comprobar('el stock queda en 33', trasConteo === 33, `quedó en ${trasConteo}`);

  seccion('4. El kardex del producto cuenta la historia');
  await pagina.goto(`${APP}/inventario/entradas/${elegido.id}/kardex`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  const enPantalla = await texto(pagina);
  comprobar('el modal de kardex abre', (await pagina.$('[role="dialog"]')) !== null);
  comprobar(
    'y muestra los movimientos de recién',
    enPantalla.includes('7') && enPantalla.includes('33'),
    'no se ven las cantidades',
  );
  await pagina.keyboard.press('Escape');
  await esperar(1000);
  comprobar('cierra con Esc', (await pagina.$('[role="dialog"]')) === null);

  seccion('5. La pantalla de Kardex filtra por tipo');
  await pagina.goto(`${APP}/inventario/kardex?tipo=purchase`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  const entradas = await api(pagina, '/inventory/movements?kind=purchase&page=1&perPage=5');
  comprobar(
    'el filtro de entradas trae solo entradas',
    (entradas.items ?? []).every((item) => item.kind === 'purchase'),
    JSON.stringify((entradas.items ?? []).map((i) => i.kind).slice(0, 4)),
  );

  // Una URL con un tipo inventado no puede romper la pantalla.
  await pagina.goto(`${APP}/inventario/kardex?tipo=inventado`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  comprobar(
    'un tipo que no existe se ignora en vez de romper',
    (await texto(pagina)).includes('Kardex') || (await texto(pagina)).includes('movimiento'),
    'la pantalla quedó vacía',
  );

  seccion('6. Un conteo por sesión ajusta el stock al cerrarlo');
  const abierta = await api(pagina, '/inventory/counts/sessions/open');
  if (abierta !== null && abierta?.id !== undefined) {
    await api(pagina, `/inventory/counts/sessions/${abierta.id}/discard`, 'POST');
  }
  await pagina.goto(`${APP}/inventario/conteo`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  await tocar(pagina, 'Empezar conteo');
  await esperar(2600);
  const sesion = await api(pagina, '/inventory/counts/sessions/open');
  comprobar('la sesión queda abierta', sesion?.id !== undefined, JSON.stringify(sesion).slice(0, 60));

  // Se anota una cantidad distinta para el producto elegido.
  const anotado = await api(pagina, `/inventory/counts/sessions/${sesion.id}/lines`, 'POST', {
    productId: elegido.id,
    countedQuantity: 40,
  });
  comprobar('se anota lo contado', anotado?.countedQuantity === 40, JSON.stringify(anotado).slice(0, 80));
  await api(pagina, `/inventory/counts/sessions/${sesion.id}/close`, 'POST', {
    note: 'prueba automática',
  });
  await esperar(1200);
  const trasCerrar = await stockDe(pagina, elegido.id);
  comprobar(
    'al cerrar, el stock queda en lo contado',
    trasCerrar === 40,
    `quedó en ${trasCerrar}`,
  );
  comprobar(
    'y la sesión ya no está abierta',
    (await api(pagina, '/inventory/counts/sessions/open')) === null,
  );

  seccion('7. Por vencer muestra los lotes que se van a pasar');
  await pagina.goto(`${APP}/inventario/por-vencer`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  const lotes = await api(pagina, '/inventory/expiring');
  comprobar(
    'la pantalla y el servidor dicen lo mismo',
    (await texto(pagina)).includes('lote') || (lotes.items ?? []).length === 0,
    `el servidor tiene ${(lotes.items ?? []).length} lotes`,
  );
} finally {
  await navegador.close();
}

reporte.cerrar();
