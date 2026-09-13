// Lo que comparten los scripts que manejan el navegador. Cada módulo tiene su
// script (probar-caja, probar-inventario, …) y todos necesitan lo mismo:
// entrar con un PIN, tocar un botón por su texto, y preguntarle al API cómo
// quedaron los datos. La verdad de una prueba está en los datos, no en la
// pantalla: un total puede verse bien y estar mal guardado.
import puppeteer from 'puppeteer-core';

export const APP = process.env.MANA_APP ?? 'http://localhost:3210';
export const PIN_DUENO = '2580';

export const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function crearReporte() {
  const estado = { pasados: 0, fallados: 0 };

  return {
    estado,
    seccion(titulo) {
      console.log(`\n${titulo}`);
    },
    comprobar(nombre, condicion, detalle) {
      if (condicion) {
        estado.pasados += 1;
        console.log(`  ok      ${nombre}`);
        return;
      }
      estado.fallados += 1;
      console.log(`  FALLA   ${nombre}${detalle === undefined ? '' : ` — ${detalle}`}`);
    },
    cerrar() {
      console.log(`\n${estado.pasados} bien · ${estado.fallados} mal`);
      process.exitCode = estado.fallados === 0 ? 0 : 1;
    },
  };
}

export async function abrirNavegador() {
  return puppeteer.launch({
    executablePath: process.env.MANA_CHROME ?? '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
}

// Una pestaña que avisa de los errores de la app. Los pedidos que hace el
// propio script van marcados con `x-prueba` y no cuentan: algunos preguntan a
// propósito por cosas que acaban de borrarse.
//
// `esperado(metodo, ruta, estado)` deja pasar los rechazos que la prueba
// PROVOCA a propósito: cerrar la caja sin explicar un descuadre devuelve 409
// y eso es exactamente lo que se está comprobando.
export async function abrirPagina(navegador, reporte, esperado = () => false) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1366, height: 768 });
  pagina.on('pageerror', (error) => {
    reporte.comprobar(`sin errores de página`, false, String(error).slice(0, 120));
  });
  pagina.on('response', (respuesta) => {
    if (respuesta.status() < 400) return;
    if (respuesta.request().headers()['x-prueba'] === '1') return;
    const url = new URL(respuesta.url()).pathname;
    // Buscar un código de barras que no existe NO es un error: es la respuesta
    // correcta a «¿este código está libre?», que el formulario pregunta
    // mientras se escanea.
    if (respuesta.status() === 404 && url.includes('/catalog/products/by-barcode/')) return;
    if (esperado(respuesta.request().method(), url, respuesta.status())) return;
    reporte.comprobar(
      `${respuesta.request().method()} ${url}`,
      false,
      `respondió ${respuesta.status()}`,
    );
  });
  pagina.on('dialog', (aviso) => aviso.accept());
  return pagina;
}

export async function tocar(pagina, texto, indice = 0) {
  await pagina.evaluate(
    (buscado, i) => {
      const todos = [...document.querySelectorAll('button, a')];
      const exactos = todos.filter((nodo) => nodo.textContent.trim() === buscado);
      const elegido =
        exactos[i] ?? todos.filter((nodo) => nodo.textContent.trim().includes(buscado))[i];
      elegido?.click();
    },
    texto,
    indice,
  );
  await esperar(1000);
}

// El botón del cuadro de arriba, cuando hay un modal sobre otro.
export async function tocarArriba(pagina, texto) {
  await pagina.evaluate((buscado) => {
    const cuadros = [...document.querySelectorAll('[role="dialog"]')];
    const botones = [...(cuadros[cuadros.length - 1]?.querySelectorAll('button') ?? [])];
    (botones.find((nodo) => nodo.textContent.trim() === buscado) ??
      botones.find((nodo) => nodo.textContent.trim().includes(buscado)))?.click();
  }, texto);
  await esperar(1100);
}

export async function entrar(pagina, pin = PIN_DUENO) {
  await pagina.goto(APP, { waitUntil: 'domcontentloaded' });
  await esperar(1400);
  for (const digito of pin) await tocar(pagina, digito);
  await tocar(pagina, '✓');
  await esperar(2400);
}

export const ruta = (pagina) => pagina.evaluate(() => location.pathname + location.search);
export const texto = (pagina) => pagina.evaluate(() => document.body.innerText);
export const cuadros = (pagina) =>
  pagina.evaluate(() => document.querySelectorAll('[role="dialog"]').length);

export function api(pagina, url, metodo = 'GET', cuerpo) {
  return pagina.evaluate(
    async (u, m, body) => {
      const token = localStorage.getItem('mana-pos-token');
      const cabeceras = { authorization: `Bearer ${token}`, 'x-prueba': '1' };
      if (body !== null) cabeceras['content-type'] = 'application/json';
      const r = await fetch(u, {
        method: m,
        headers: cabeceras,
        body: body === null ? undefined : JSON.stringify(body),
      });
      if (r.status === 204) return null;
      return r.ok ? r.json() : { error: r.status };
    },
    url,
    metodo,
    cuerpo ?? null,
  );
}

// Vaciar de verdad antes de escribir: el triple clic no siempre selecciona
// todo (depende del contenido) y lo tecleado terminaba pegado a lo anterior.
async function reemplazar(pagina, campo, valor) {
  await campo.click();
  await pagina.keyboard.down('Control');
  await pagina.keyboard.press('KeyA');
  await pagina.keyboard.up('Control');
  await pagina.keyboard.press('Backspace');
  if (String(valor) !== '') await campo.type(String(valor));
  await esperar(300);
}

// Escribe en el n-ésimo campo numérico visible, reemplazando lo que haya.
export async function escribirEnCampo(pagina, indice, valor) {
  const campos = await pagina.$$('input[type="number"]');
  const campo = campos[indice];
  if (campo === undefined) return false;
  await reemplazar(pagina, campo, valor);
  return true;
}

export async function escribirEn(pagina, selector, valor) {
  const campo = await pagina.$(selector);
  if (campo === null) return false;
  await reemplazar(pagina, campo, valor);
  return true;
}

// El n-ésimo campo de texto de un modal (nombre, concepto, motivo…).
export async function escribirEnTexto(pagina, indice, valor) {
  const campos = await pagina.$$(
    '[role="dialog"] input:not([type="number"]):not([type="checkbox"]):not([type="date"])',
  );
  const campo = campos[indice];
  if (campo === undefined) return false;
  await reemplazar(pagina, campo, valor);
  return true;
}

export const soles = (centimos) => (centimos / 100).toFixed(2);
