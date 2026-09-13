// Recorre Clientes y Fiado, que es la plata que la tienda tiene prestada.
// Crear un cliente, fiarle, abonarle, y los dos límites que protegen a la
// tienda: no fiar más de lo permitido y no abonar más de lo que se debe.
// Todo se comprueba contra el saldo que quedó en el servidor.
//
//   npm run build && node scripts/probar-clientes.mjs
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
const cuenta = (pagina, id) => api(pagina, `/customers/${id}`);

const navegador = await abrirNavegador();
try {
  // Abonar de más y pasarse del límite se rechazan a propósito: son los pasos
  // 4 y 6, y esos rechazos son la prueba.
  const pagina = await abrirPagina(
    navegador,
    reporte,
    (metodo, url, estado) =>
      metodo === 'POST' && (url.endsWith('/payments') || url === '/sales/checkout') && estado === 409,
  );
  await entrar(pagina);

  // La caja tiene que estar abierta: un abono entra por caja.
  if ((await api(pagina, '/cash/status')).open === false) {
    await api(pagina, '/cash/open', 'POST', { shift: 'morning', openingCents: 5000 });
  }

  const nombre = `Cliente de prueba ${Date.now().toString().slice(-5)}`;

  seccion('1. Crear un cliente desde la pantalla');
  await pagina.goto(`${APP}/clientes/directorio`, { waitUntil: 'domcontentloaded' });
  await esperar(2200);
  await tocar(pagina, '+ Nuevo cliente');
  await esperar(1400);
  await pagina.type('[role="dialog"] input', nombre);
  await escribirEnCampo(pagina, 0, '30.00');
  await tocarArriba(pagina, 'Crear cliente');
  await esperar(2400);
  const listado = await api(pagina, `/customers?query=${encodeURIComponent(nombre)}`);
  const creado = (Array.isArray(listado) ? listado : listado.items ?? [])[0];
  comprobar('el cliente queda creado', creado !== undefined, JSON.stringify(listado).slice(0, 80));
  if (creado === undefined) throw new Error('sin cliente no se puede seguir');
  comprobar(
    'con el límite que se puso',
    creado.creditLimitCents === 3000,
    `guardó ${creado.creditLimitCents}`,
  );
  comprobar('y sin deuda', creado.balanceCents === 0, `debía ${creado.balanceCents}`);

  seccion('2. Editarlo cambia lo que se ve y lo que se guarda');
  await pagina.goto(`${APP}/clientes/directorio/${creado.id}/editar`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  comprobar('el modal abre desde su URL', (await pagina.$('[role="dialog"]')) !== null);
  await escribirEnCampo(pagina, 0, '80.00');
  await tocarArriba(pagina, 'Guardar cambios');
  await esperar(2400);
  comprobar(
    'el límite nuevo quedó guardado',
    (await cuenta(pagina, creado.id)).creditLimitCents === 8000,
    `quedó en ${(await cuenta(pagina, creado.id)).creditLimitCents}`,
  );

  seccion('3. Fiarle sube la deuda exactamente');
  const producto = (await api(pagina, '/catalog/products?query=&page=1&perPage=5')).items.find(
    (item) => item.saleType === 'unit',
  );
  // El total se redondea a S/ 0.10, como hace la app.
  const aDiez = (centimos) => Math.round(centimos / 10) * 10;
  const totalFiado = aDiez(producto.priceCents);
  const venta = await api(pagina, '/sales/checkout', 'POST', {
    ticketId: crypto.randomUUID(),
    lines: [{ saleType: 'unit', productId: producto.id, quantity: 1 }],
    payments: [{ method: 'credit', amountCents: totalFiado, customerId: creado.id }],
  });
  comprobar('la venta a fiado pasa', venta.error === undefined, JSON.stringify(venta).slice(0, 90));
  const conDeuda = await cuenta(pagina, creado.id);
  comprobar(
    'la deuda es el precio del producto',
    conDeuda.balanceCents === totalFiado,
    `debía ${conDeuda.balanceCents}, el producto vale ${totalFiado}`,
  );

  seccion('4. El abono baja la deuda, y no puede pasarse');
  await pagina.goto(`${APP}/clientes/fiado/${creado.id}/abonar`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  comprobar('el modal de abono abre', (await pagina.$('[role="dialog"]')) !== null);
  const deMas = ((conDeuda.balanceCents + 5000) / 100).toFixed(2);
  await escribirEnCampo(pagina, 0, deMas);
  await tocarArriba(pagina, 'Registrar abono');
  await esperar(2200);
  comprobar(
    'abonar más de lo que debe no pasa',
    (await cuenta(pagina, creado.id)).balanceCents === conDeuda.balanceCents,
    'la deuda cambió con un abono de más',
  );

  const mitad = aDiez(Math.floor(conDeuda.balanceCents / 2));
  await escribirEnCampo(pagina, 0, (mitad / 100).toFixed(2));
  await tocarArriba(pagina, 'Registrar abono');
  await esperar(2600);
  const trasAbono = await cuenta(pagina, creado.id);
  comprobar(
    'el abono baja la deuda por lo abonado',
    trasAbono.balanceCents === conDeuda.balanceCents - mitad,
    `${conDeuda.balanceCents} - ${mitad} debería ser ${conDeuda.balanceCents - mitad}, quedó ${trasAbono.balanceCents}`,
  );
  comprobar(
    'y vuelve al listado',
    (await ruta(pagina)).startsWith('/clientes/fiado'),
    await ruta(pagina),
  );

  seccion('5. El estado de cuenta muestra los dos movimientos');
  await pagina.goto(`${APP}/clientes/fiado/${creado.id}/estado-de-cuenta`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2600);
  const estadoCuenta = await api(pagina, `/customers/${creado.id}/statement`);
  comprobar(
    'el servidor tiene la venta y el abono',
    (estadoCuenta.entries ?? []).length >= 2,
    `tenía ${(estadoCuenta.entries ?? []).length} movimientos`,
  );
  comprobar(
    'y la pantalla los muestra',
    (await texto(pagina)).includes('Abono') || (await texto(pagina)).includes('abono'),
    'no se ve el abono en pantalla',
  );

  seccion('6. El límite de crédito frena una venta que se pasa');
  const restante = (await cuenta(pagina, creado.id)).availableCents;
  const caro = await api(pagina, '/sales/checkout', 'POST', {
    ticketId: crypto.randomUUID(),
    lines: [{ saleType: 'unit', productId: producto.id, quantity: 1 }],
    payments: [
      { method: 'credit', amountCents: aDiez(restante) + 100000, customerId: creado.id },
    ],
  });
  comprobar(
    'pasarse del límite se rechaza',
    caro.error !== undefined,
    JSON.stringify(caro).slice(0, 90),
  );

  seccion('7. El directorio encuentra al cliente por su nombre');
  await pagina.goto(`${APP}/clientes/directorio?q=${encodeURIComponent(nombre.slice(0, 12))}`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  comprobar('aparece en la búsqueda', (await texto(pagina)).includes(nombre.slice(0, 12)));
} finally {
  await navegador.close();
}

reporte.cerrar();
