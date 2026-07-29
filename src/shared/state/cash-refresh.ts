import { createSignal } from 'solid-js';

// Señal transversal: cualquier operación que mueva dinero (venta, anulación,
// abono, retiro…) llama bumpCashRefresh() y todo indicador de caja se refresca
// al instante, sin esperar el intervalo de fondo.
const [version, setVersion] = createSignal(0);

export function cashRefreshVersion(): number {
  return version();
}

export function bumpCashRefresh(): void {
  setVersion((value) => value + 1);
}
