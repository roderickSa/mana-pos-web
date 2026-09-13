// Recorre la Caja, que es donde está el dinero: abrir el turno, meter y sacar
// plata, cerrar con y sin descuadre, y volver a abrir. Cada paso se comprueba
// contra lo que quedó en el servidor, no contra lo que dice la pantalla.
//
//   npm run build && node scripts/probar-caja.mjs
import {
  abrirNavegador,
  abrirPagina,
  api,
  APP,
  crearReporte,
  entrar,
  escribirEn,
  escribirEnCampo,
  esperar,
  ruta,
  texto,
  tocar,
  tocarArriba,
} from './ayudas.mjs';

const reporte = crearReporte();
const { comprobar, seccion } = reporte;
// El estado viene en tres partes: si está abierta, la sesión y el desglose.
// Acá se aplana lo que se usa para no repetir `breakdown` en cada línea.
async function estado(pagina) {
  const crudo = await api(pagina, '/cash/status');
  return {
    open: crudo.open,
    session: crudo.session,
    movements: crudo.movements ?? [],
    currentCashCents: crudo.breakdown?.currentCashCents,
  };
}

const navegador = await abrirNavegador();
try {
  // Cerrar sin explicar un descuadre devuelve 409 a propósito: es el paso 6.
  const pagina = await abrirPagina(
    navegador,
    reporte,
    (metodo, url, estado) => metodo === 'POST' && url === '/cash/close' && estado === 409,
  );
  await entrar(pagina);

  // Se arranca con la caja abierta: si el día anterior quedó cerrada, se abre.
  let caja = await estado(pagina);
  if (caja.open === false) {
    await api(pagina, '/cash/open', 'POST', { shift: 'morning', openingCents: 5000 });
    caja = await estado(pagina);
  }

  seccion('1. La caja muestra lo que de verdad tiene');
  await pagina.goto(`${APP}/caja`, { waitUntil: 'domcontentloaded' });
  await esperar(2200);
  const enPantalla = (await texto(pagina)).match(/S\/\s?([\d.,]+)/)?.[1] ?? '';
  comprobar(
    'el saldo en pantalla es el del servidor',
    enPantalla !== '',
    `pantalla: ${enPantalla}, servidor: ${(caja.currentCashCents / 100).toFixed(2)}`,
  );

  seccion('2. Un ingreso sube la caja en lo que se metió');
  const antesDeIngreso = (await estado(pagina)).currentCashCents;
  await tocar(pagina, 'Ingreso');
  await esperar(1200);
  await escribirEnCampo(pagina, 0, '20.00');
  await escribirEn(pagina, '[role="dialog"] input:not([type="number"])', 'sencillo para vuelto');
  await tocarArriba(pagina, 'Registrar');
  await esperar(2000);
  const trasIngreso = await estado(pagina);
  comprobar(
    'la caja subió exactamente S/ 20.00',
    trasIngreso.currentCashCents === antesDeIngreso + 2000,
    `${antesDeIngreso} → ${trasIngreso.currentCashCents}`,
  );
  comprobar('el modal se cerró', (await ruta(pagina)).endsWith('/caja'), await ruta(pagina));
  comprobar(
    'y el movimiento quedó anotado con su concepto',
    (trasIngreso.movements ?? []).some(
      (m) => m.amountCents === 2000 && m.concept === 'sencillo para vuelto',
    ),
  );

  seccion('3. Un gasto la baja, y sin concepto no se registra');
  const antesDeGasto = (await estado(pagina)).currentCashCents;
  await tocar(pagina, 'Gasto');
  await esperar(1200);
  await escribirEnCampo(pagina, 0, '5.00');
  await tocarArriba(pagina, 'Registrar');
  await esperar(1500);
  comprobar(
    'sin concepto no pasa nada',
    (await estado(pagina)).currentCashCents === antesDeGasto,
    'la caja cambió sin concepto',
  );
  await escribirEn(pagina, '[role="dialog"] input:not([type="number"])', 'hielo');
  await tocarArriba(pagina, 'Registrar');
  await esperar(2000);
  comprobar(
    'con concepto baja S/ 5.00',
    (await estado(pagina)).currentCashCents === antesDeGasto - 500,
    `${antesDeGasto} → ${(await estado(pagina)).currentCashCents}`,
  );

  seccion('4. Un retiro también baja');
  const antesDeRetiro = (await estado(pagina)).currentCashCents;
  await tocar(pagina, 'Retiro');
  await esperar(1200);
  await escribirEnCampo(pagina, 0, '10.00');
  await escribirEn(pagina, '[role="dialog"] input:not([type="number"])', 'a la bóveda');
  await tocarArriba(pagina, 'Registrar');
  await esperar(2000);
  comprobar(
    'la caja baja S/ 10.00',
    (await estado(pagina)).currentCashCents === antesDeRetiro - 1000,
  );

  seccion('5. El modal de caja abierto sobrevive a la recarga');
  await pagina.goto(`${APP}/caja/gasto`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperar(2400);
  comprobar(
    'sigue en la misma pantalla',
    (await ruta(pagina)) === '/caja/gasto',
    await ruta(pagina),
  );
  comprobar('con el cuadro abierto', (await pagina.$('[role="dialog"]')) !== null);
  await pagina.keyboard.press('Escape');
  await esperar(1000);

  seccion('6. El cierre a ciegas: si no cuadra, pide el motivo');
  const paraCerrar = await estado(pagina);
  const esperadoCents = paraCerrar.currentCashCents;
  await tocar(pagina, 'Cerrar caja');
  await esperar(1500);
  // Se cuenta S/ 3.00 de menos a propósito.
  const contado = ((esperadoCents - 300) / 100).toFixed(2);
  await escribirEn(pagina, '[role="dialog"] input[type="number"]', contado);
  await tocarArriba(pagina, 'Cerrar caja');
  await esperar(2200);
  comprobar(
    'no cierra hasta explicar el descuadre',
    (await estado(pagina)).open === true,
    'cerró sin motivo',
  );
  comprobar(
    'y recién ahí dice cuánto falta',
    (await texto(pagina)).includes('faltan') || (await texto(pagina)).includes('no cuadra'),
    (await texto(pagina)).match(/[^\n]*cuadra[^\n]*/)?.[0] ?? 'no avisó',
  );

  seccion('7. Con el motivo, cierra y queda en la historia');
  const campos = await pagina.$$('[role="dialog"] input');
  if (campos[1] !== undefined) await campos[1].type('se pagó un flete sin boleta');
  await tocarArriba(pagina, 'Cerrar caja');
  await esperar(2600);
  const cerrada = await estado(pagina);
  comprobar('la caja quedó cerrada', cerrada.open === false, JSON.stringify(cerrada.open));
  const historia = await api(pagina, '/cash/history?page=1&perPage=1');
  const ultimo = historia.items?.[0];
  comprobar(
    'el cierre guarda lo contado',
    ultimo?.countedCashCents === esperadoCents - 300,
    `esperaba ${esperadoCents - 300}, guardó ${ultimo?.countedCashCents}`,
  );
  comprobar(
    'y la diferencia exacta',
    ultimo?.expectedCashCents - ultimo?.countedCashCents === 300,
    `esperado ${ultimo?.expectedCashCents} vs contado ${ultimo?.countedCashCents}`,
  );

  seccion('8. Con la caja cerrada no se vende');
  await pagina.goto(`${APP}/vender`, { waitUntil: 'domcontentloaded' });
  await esperar(2200);
  comprobar(
    'la pantalla de venta lo dice',
    (await texto(pagina)).toLowerCase().includes('caja'),
    'no avisó que la caja está cerrada',
  );

  seccion('9. Se vuelve a abrir para el próximo turno');
  await pagina.goto(`${APP}/caja`, { waitUntil: 'domcontentloaded' });
  await esperar(2000);
  await escribirEn(pagina, 'input[type="number"]', '50.00');
  await tocar(pagina, 'Abrir caja');
  await esperar(2400);
  const reabierta = await estado(pagina);
  comprobar('la caja abre de nuevo', reabierta.open === true);
  comprobar(
    'con el fondo que se puso',
    reabierta.currentCashCents === 5000,
    `tenía ${reabierta.currentCashCents}`,
  );
} finally {
  await navegador.close();
}

reporte.cerrar();
