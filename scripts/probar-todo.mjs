// Corre todos los recorridos, uno detrás de otro, y al final dice qué módulo
// falló. Es el botón de «revisá todo» antes de tocar algo importante.
//
//   npm run build && npm run probar:todo
import { spawnSync } from 'node:child_process';

const RECORRIDOS = [
  ['Vender', 'probar-vender.mjs'],
  ['Caja', 'probar-caja.mjs'],
  ['Productos', 'probar-productos.mjs'],
  ['Inventario', 'probar-inventario.mjs'],
  ['Clientes', 'probar-clientes.mjs'],
  ['Compras', 'probar-compras.mjs'],
  ['Rutas', 'probar-rutas.mjs'],
  ['Recarga', 'probar-recarga.mjs'],
];

const resultados = [];
for (const [nombre, archivo] of RECORRIDOS) {
  console.log(`\n════ ${nombre} ${'═'.repeat(Math.max(0, 60 - nombre.length))}`);
  const corrida = spawnSync('node', [`scripts/${archivo}`], { stdio: 'inherit' });
  resultados.push([nombre, corrida.status === 0]);
}

console.log('\n════ Resumen ════');
for (const [nombre, bien] of resultados) {
  console.log(`  ${bien ? 'ok   ' : 'FALLA'} ${nombre}`);
}
process.exitCode = resultados.every(([, bien]) => bien) ? 0 : 1;
