import { createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import { currentNotice } from '@/shared/state/notices';
import { cashRefreshVersion } from '@/shared/state/cash-refresh';
import { getCashStatus } from '@/shared/api/cash';
import { formatSoles } from '@/shared/lib/money';
import { currentUser, endSession, isManager } from '@/shared/state/session';
import styles from './TopBar.module.css';

async function cashInDrawer(): Promise<number | null> {
  try {
    const status = await getCashStatus();
    return status.open ? status.breakdown.currentCashCents : null;
  } catch {
    return null;
  }
}

export type View = 'venta' | 'caja' | 'ventas' | 'fiado' | 'inventario' | 'equipos' | 'ajustes';

// La cajera solo ve lo operativo; lo administrativo (reportes, costos,
// usuarios) es del encargado.
const VIEWS: Array<{ key: View; label: string; managerOnly: boolean }> = [
  { key: 'venta', label: 'Vender', managerOnly: false },
  { key: 'caja', label: 'Caja', managerOnly: false },
  { key: 'ventas', label: 'Ventas', managerOnly: true },
  { key: 'fiado', label: 'Fiado', managerOnly: false },
  { key: 'inventario', label: 'Inventario', managerOnly: true },
  { key: 'equipos', label: 'Equipos', managerOnly: false },
  { key: 'ajustes', label: 'Ajustes', managerOnly: true },
];

export const TopBar: Component<{
  view: View;
  onNavigate: (view: View) => void;
}> = (props) => {
  const visibleViews = () => VIEWS.filter((item) => !item.managerOnly || isManager());
  const [now, setNow] = createSignal(new Date());
  const [cashTick, setCashTick] = createSignal(0);
  const [cash] = createResource(
    () => ({ tick: cashTick(), version: cashRefreshVersion() }),
    cashInDrawer,
  );
  const interval = setInterval(() => {
    setNow(new Date());
    setCashTick((value) => value + 1);
  }, 15_000);
  onCleanup(() => clearInterval(interval));

  const clock = () =>
    now().toLocaleString('es-PE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <header class={styles.topbar}>
      <span class={styles.marca}>
        man<span class={styles.acento}>á</span>
      </span>

      <nav class={styles.nav} aria-label="Secciones">
        <For each={visibleViews()}>
          {(item) => (
            <button
              type="button"
              class={styles.navBoton}
              classList={{ [styles.navActiva]: props.view === item.key }}
              onClick={() => props.onNavigate(item.key)}
            >
              {item.label}
            </button>
          )}
        </For>
      </nav>

      <span class={styles.spacer} />
      <Show when={currentNotice() !== ''}>
        <span class={`${styles.chip} ${styles.aviso}`} role="status">
          {currentNotice()}
        </span>
      </Show>
      <span
        class={`${styles.chip} ${styles.caja}`}
        classList={{ [styles.cajaCerrada]: cash() === null }}
        title="Efectivo real en el cajón: fondo + ventas + abonos − retiros − gastos. Se actualiza con cada operación."
      >
        {cash() === null || cash() === undefined ? 'Caja cerrada' : `Caja: ${formatSoles(cash() ?? 0)}`}
      </span>
      <span class={styles.chip}>
        <span class={styles.avatar}>{(currentUser()?.name ?? '?').charAt(0)}</span>
        {currentUser()?.name ?? '—'}
        <small>· {isManager() ? 'encargado' : 'cajera'}</small>
      </span>
      <button type="button" class={`${styles.chip} ${styles.salir}`} onClick={endSession}>
        Salir
      </button>
      <span class={styles.reloj}>{clock()}</span>
    </header>
  );
};
