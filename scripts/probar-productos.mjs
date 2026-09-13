// Recorre el catálogo: crear un producto, buscarlo, cambiarle el precio,
// ajustar su stock, desactivarlo, y las categorías. Un producto mal cargado
// se paga después en cada venta, así que todo se comprueba contra el servidor.
//
//   npm run build && node scripts/probar-productos.mjs
import {
  abrirNavegador,
  abrirPagina,
  api,
  APP,
  crearReporte,
  entrar,
  escribirEnCampo,
  escribirEnTexto,
  esperar,
  ruta,
  texto,
  tocar,
  tocarArriba,
} from './ayudas.mjs';

const reporte = crearReporte();
const { comprobar, seccion } = reporte;
const buscar = (pagina, q) => api(pagina, `/catalog/products?query=${encodeURIComponent(q)}&page=1&perPage=5`);

const navegador = await abrirNavegador();
try {
  const pagina = await abrirPagina(navegador, reporte);
  await entrar(pagina);

  const sufijo = Date.now().toString().slice(-6);
  const nombre = `Galleta de prueba ${sufijo}`;
  const codigo = `779${sufijo}0`;

  seccion('1. Crear un producto desde la pantalla');
  await pagina.goto(`${APP}/productos/nuevo`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  comprobar('el formulario abre desde su URL', (await pagina.$('[role="dialog"]')) !== null);
  // Nombre, código de barras, precio y costo, en ese orden en el formulario.
  const textos = await pagina.$$('[role="dialog"] input:not([type="number"]):not([type="checkbox"])');
  if (textos[0] !== undefined) await textos[0].type(nombre);
  if (textos[1] !== undefined) await textos[1].type(codigo);
  const numeros = await pagina.$$('[role="dialog"] input[type="number"]');
  if (numeros[0] !== undefined) await numeros[0].type('2.50');
  if (numeros[1] !== undefined) await numeros[1].type('1.80');
  await esperar(400);
  await tocarArriba(pagina, 'Crear producto');
  await esperar(2600);

  const encontrado = (await buscar(pagina, nombre)).items?.[0];
  comprobar('el producto queda creado', encontrado !== undefined, `busqué «${nombre}»`);
  if (encontrado === undefined) throw new Error('sin producto no se puede seguir');
  comprobar('con su precio', encontrado.priceCents === 250, `guardó ${encontrado.priceCents}`);
  comprobar('y su costo', encontrado.costCents === 180, `guardó ${encontrado.costCents}`);

  seccion('2. Se encuentra por su código de barras');
  const porCodigo = await api(pagina, `/catalog/products/by-barcode/${codigo}`);
  comprobar('el código lo encuentra', porCodigo?.id === encontrado.id, JSON.stringify(porCodigo).slice(0, 70));

  seccion('3. Un código repetido no se puede usar dos veces');
  const repetido = await api(pagina, '/catalog/products', 'POST', {
    name: `Otro ${sufijo}`,
    category: encontrado.category,
    saleType: 'unit',
    barcode: codigo,
    priceCents: 300,
    costCents: 200,
    stockMinimum: 1,
  });
  comprobar(
    'el servidor rechaza el código duplicado',
    repetido.error !== undefined,
    JSON.stringify(repetido).slice(0, 90),
  );

  seccion('4. Cambiar el precio desde su modal');
  await pagina.goto(`${APP}/productos/${encontrado.id}/precio`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  comprobar('el modal de precio abre', (await pagina.$('[role="dialog"]')) !== null);
  await escribirEnCampo(pagina, 0, '3.50');
  await tocarArriba(pagina, 'Actualizar precio');
  await esperar(2400);
  const conPrecio = (await buscar(pagina, nombre)).items?.[0];
  comprobar('el precio nuevo queda guardado', conPrecio?.priceCents === 350, `quedó ${conPrecio?.priceCents}`);
  comprobar('y vuelve al listado', (await ruta(pagina)).startsWith('/productos'), await ruta(pagina));

  seccion('5. Ajustar el stock desde su modal');
  await pagina.goto(`${APP}/productos/${encontrado.id}/stock`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  await escribirEnCampo(pagina, 0, '15');
  await tocarArriba(pagina, 'Actualizar stock');
  await esperar(2400);
  const conStock = (await buscar(pagina, nombre)).items?.[0];
  comprobar('el stock queda en 15', conStock?.stockUnits === 15, `quedó en ${conStock?.stockUnits}`);

  seccion('6. Editarlo cambia el nombre');
  await pagina.goto(`${APP}/productos/${encontrado.id}/editar`, { waitUntil: 'domcontentloaded' });
  await esperar(2600);
  await escribirEnTexto(pagina, 0, `${nombre} XL`);
  await tocarArriba(pagina, 'Guardar cambios');
  await esperar(2600);
  const renombrado = await api(pagina, `/catalog/products/${encontrado.id}`);
  comprobar('el nombre nuevo queda guardado', renombrado.name === `${nombre} XL`, renombrado.name);

  seccion('7. La búsqueda del listado encuentra lo que se busca');
  await pagina.goto(`${APP}/productos?q=${encodeURIComponent(sufijo)}`, {
    waitUntil: 'domcontentloaded',
  });
  await esperar(2400);
  comprobar('aparece en la lista', (await texto(pagina)).includes(sufijo));
  comprobar(
    'y la búsqueda queda en la URL',
    (await ruta(pagina)).includes(`q=${sufijo}`),
    await ruta(pagina),
  );

  seccion('8. Categorías: crear, renombrar y borrar');
  const nombreCat = `Prueba ${sufijo}`;
  await pagina.goto(`${APP}/productos/categorias/nueva`, { waitUntil: 'domcontentloaded' });
  await esperar(2400);
  comprobar('el formulario de categoría abre', (await pagina.$('[role="dialog"]')) !== null);
  await pagina.type('[role="dialog"] input', nombreCat);
  await tocarArriba(pagina, 'Guardar');
  await esperar(2400);
  const categorias = await api(pagina, '/catalog/categories');
  const nueva = (Array.isArray(categorias) ? categorias : categorias.items ?? []).find(
    (item) => item.name === nombreCat,
  );
  comprobar('la categoría queda creada', nueva !== undefined, JSON.stringify(categorias).slice(0, 80));

  if (nueva !== undefined) {
    await pagina.goto(`${APP}/productos/categorias/${nueva.slug}/editar`, {
      waitUntil: 'domcontentloaded',
    });
    await esperar(2400);
    await escribirEnTexto(pagina, 0, `${nombreCat} bis`);
    await tocarArriba(pagina, 'Guardar');
    await esperar(2400);
    const despues = await api(pagina, '/catalog/categories');
    comprobar(
      'renombrarla la renombra',
      (Array.isArray(despues) ? despues : despues.items ?? []).some(
        (item) => item.name === `${nombreCat} bis`,
      ),
    );
    // Se limpia para no dejar basura en la demo.
    await api(pagina, `/catalog/categories/${nueva.slug}`, 'DELETE');
  }

  seccion('9. Un producto desactivado no se ofrece al vender');
  await api(pagina, `/catalog/products/${encontrado.id}`, 'PUT', {
    name: renombrado.name,
    category: renombrado.category,
    priceCents: renombrado.priceCents,
    costCents: renombrado.costCents,
    stockMinimum: renombrado.stockMinimum,
    barcode: renombrado.barcode,
    shortCode: renombrado.shortCode,
    active: false,
    quickAccess: false,
  });
  const activos = await api(pagina, `/catalog/products?query=${encodeURIComponent(sufijo)}&onlyActive=true`);
  comprobar(
    'ya no está entre los activos',
    !(activos.items ?? []).some((item) => item.id === encontrado.id),
    `seguía apareciendo`,
  );
} finally {
  await navegador.close();
}

reporte.cerrar();
