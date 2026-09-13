// Abre por URL directa cada pantalla y cada modal de la app, como si alguien
// hubiera pegado el link o hubiera recargado con el modal abierto. Comprueba
// que la ruta se queda donde debe, que el modal aparece y que no hay errores
// de consola.
//
//   npm run build && node scripts/probar-rutas.mjs
import puppeteer from 'puppeteer-core';

const APP = process.env.MANA_APP ?? 'http://localhost:3210';
const PIN_DUENO = '2580';

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

const ruta = (pagina) => pagina.evaluate(() => location.pathname + location.search);

// Los ids salen del propio API, con el token de la sesión abierta en la página.
async function api(pagina, camino) {
  return pagina.evaluate(async (url) => {
    const token = localStorage.getItem('mana-pos-token');
    const respuesta = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!respuesta.ok) return null;
    return respuesta.json();
  }, camino);
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
    console.log(`  FALLA   error de página: ${String(error).slice(0, 140)}`);
  });
  pagina.on('console', (mensaje) => {
    if (mensaje.type() !== 'error') return;
    fallados += 1;
    console.log(`  FALLA   error de consola: ${mensaje.text().slice(0, 140)}`);
  });
  pagina.on('dialog', (aviso) => aviso.accept());

  await pagina.goto(APP, { waitUntil: 'networkidle2' });
  await esperar(700);
  for (const digito of PIN_DUENO) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);

  const productos = await api(pagina, '/catalog/products?query=&page=1&perPage=1');
  const productId = productos?.items?.[0]?.id;
  const categorias = await api(pagina, '/catalog/categories');
  const categoriaSlug = (Array.isArray(categorias) ? categorias : categorias?.items)?.[0]?.slug;
  const clientes = await api(pagina, '/customers?page=1&perPage=1');
  const clienteId = clientes?.items?.[0]?.id;
  const proveedores = await api(pagina, '/suppliers');
  const proveedorId = (Array.isArray(proveedores) ? proveedores : proveedores?.items)?.[0]?.id;
  const usuarios = await api(pagina, '/users');
  const usuarioId = (Array.isArray(usuarios) ? usuarios : usuarios?.items)?.[0]?.id;
  const ordenes = await api(pagina, '/purchases/orders?page=1&perPage=1');
  const ordenId = ordenes?.items?.[0]?.id;
  const ventas = await api(pagina, '/sales/tickets?page=1&perPage=1');
  const ticketId = ventas?.items?.[0]?.id;
  const movimientos = await api(pagina, '/inventory/movements?page=1&perPage=25');
  const movimientoConTicket = (movimientos?.items ?? []).find((item) => item.ticketId != null);
  const borradores = await api(pagina, '/purchases/orders?status=draft&perPage=1');
  const borradorId = borradores?.items?.[0]?.id;
  const porVencer = await api(pagina, '/inventory/expiring');
  const loteId = (porVencer?.items ?? [])[0]?.lotId;

  // [ruta, si debe abrir un modal]
  const RUTAS = [
    ['/inicio', false],
    ['/vender', false],
    ['/vender?categoria=abarrotes', false],
    ['/caja', false],
    ['/caja/ingreso', true],
    ['/caja/retiro', true],
    ['/caja/gasto', true],
    ['/historial', false],
    ['/clientes/directorio', false],
    ['/clientes/fiado', false],
    ['/clientes/directorio/nuevo', true],
    ['/productos', false],
    ['/productos/nuevo', true],
    ['/productos/nuevo?codigo=7751234567890', true],
    ['/productos/importar', true],
    ['/productos/precios', true],
    ['/productos/categorias', false],
    ['/productos/categorias/nueva', true],
    ['/inventario/entradas', false],
    ['/inventario/conteo', false],
    ['/inventario/por-vencer', false],
    ['/inventario/kardex', false],
    ['/compras/ordenes', false],
    ['/compras/ordenes/nueva', false],
    ['/compras/proveedores', false],
    ['/compras/proveedores/nuevo', true],
    ['/reportes/resumen', false],
    ['/reportes/mermas', false],
    ['/ajustes/usuarios', false],
    ['/ajustes/usuarios/nuevo', true],
    ['/ajustes/equipos', false],
    ['/ajustes/respaldo', false],
  ];

  if (productId !== undefined) {
    RUTAS.push(
      [`/productos/${productId}/editar`, true],
      [`/productos/${productId}/precio`, true],
      [`/productos/${productId}/stock`, true],
      [`/productos/${productId}/fusionar`, true],
      [`/inventario/entradas/${productId}/entrada`, true],
      [`/inventario/entradas/${productId}/merma`, true],
      [`/inventario/entradas/${productId}/conteo`, true],
      [`/inventario/entradas/${productId}/kardex`, true],
    );
  }
  if (categoriaSlug !== undefined) RUTAS.push([`/productos/categorias/${categoriaSlug}/editar`, true]);
  if (clienteId !== undefined) {
    RUTAS.push(
      [`/clientes/directorio/${clienteId}/editar`, true],
      [`/clientes/fiado/${clienteId}/abonar`, true],
      [`/clientes/fiado/${clienteId}/estado-de-cuenta`, true],
    );
  }
  if (proveedorId !== undefined) {
    RUTAS.push(
      [`/compras/proveedores/${proveedorId}/editar`, true],
      [`/compras/proveedores/${proveedorId}/productos`, true],
    );
  }
  if (usuarioId !== undefined) {
    RUTAS.push([`/ajustes/usuarios/${usuarioId}/editar`, true], [`/ajustes/usuarios/${usuarioId}/pin`, true]);
  }
  if (ordenId !== undefined) RUTAS.push([`/compras/ordenes/${ordenId}`, true]);
  // El borrador se edita en pantalla completa, no en un modal.
  if (borradorId !== undefined) RUTAS.push([`/compras/ordenes/${borradorId}/editar`, false]);
  if (ticketId !== undefined) {
    RUTAS.push([`/historial/${ticketId}`, true], [`/historial/${ticketId}/devolver`, true]);
  }
  if (movimientoConTicket !== undefined) {
    RUTAS.push([`/inventario/kardex/${movimientoConTicket.ticketId}`, true]);
  }
  if (loteId !== undefined) RUTAS.push([`/inventario/por-vencer/${loteId}/merma`, true]);

  console.log(`\nAbriendo ${RUTAS.length} rutas de frente`);
  for (const [camino, conModal] of RUTAS) {
    // `domcontentloaded` y no `networkidle`: la app sondea caja e impresora
    // cada pocos segundos, así que la red nunca queda del todo quieta y una
    // sola pantalla podría colgar el barrido entero.
    await pagina.goto(`${APP}${camino}`, { waitUntil: 'domcontentloaded' });
    await esperar(1800);
    const donde = await ruta(pagina);
    const hayModal = (await pagina.$('[role="dialog"]')) !== null;
    const bien = donde === camino && hayModal === conModal;
    comprobar(
      camino,
      bien,
      donde !== camino ? `terminó en ${donde}` : `modal ${hayModal ? 'de más' : 'que no abrió'}`,
    );
  }
} finally {
  await navegador.close();
}

console.log(`\n${pasados} bien · ${fallados} mal`);
process.exitCode = fallados === 0 ? 0 : 1;
