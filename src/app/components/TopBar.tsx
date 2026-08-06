import { createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import { currentNotice } from '@/shared/state/notices';
import { cashRefreshVersion } from '@/shared/state/cash-refresh';
import { getCashStatus } from '@/shared/api/cash';
import { getDevicesStatus } from '@/shared/api/devices';
import { formatSoles } from '@/shared/lib/money';
import { currentUser, endSession, isManager, isOwner } from '@/shared/state/session';
import { logoutSession } from '@/shared/api/users';
import {
  bigTextEnabled,
  bigTextLevel,
  nightModeEnabled,
  toggleBigText,
  toggleNightMode,
} from '@/shared/state/preferences';
import styles from './TopBar.module.css';

// En producción (equipos reales), una balanza caída debe gritar en el
// header, no esconderse en el pie de página.
async function deviceAlert(): Promise<string | null> {
  try {
    const status = await getDevicesStatus();
    if (status.mode !== 'real') return null;
    if (!status.scale.connected) return 'Balanza sin conexión';
    return null;
  } catch {
    return null;
  }
}

async function cashInDrawer(): Promise<number | null> {
  try {
    const status = await getCashStatus();
    return status.open ? status.breakdown.currentCashCents : null;
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<'owner' | 'manager' | 'cashier', string> = {
  owner: 'dueño',
  manager: 'encargado',
  cashier: 'cajera',
};

export type View =
  | 'inicio'
  | 'venta'
  | 'caja'
  | 'ventas'
  | 'clientes'
  | 'inventario'
  | 'compras'
  | 'ajustes';

// La cajera solo ve lo operativo; lo administrativo (reportes, costos,
// usuarios) es del encargado. Inicio (el pulso del negocio) es del dueño.
// Ajustes (con Equipos, Voucher, IGV y los catálogos maestros) va como
// engrane a la derecha: no es de uso diario.
const VIEWS: Array<{ key: View; label: string; managerOnly: boolean; ownerOnly: boolean }> = [
  { key: 'inicio', label: 'Inicio', managerOnly: false, ownerOnly: true },
  { key: 'venta', label: 'Vender', managerOnly: false, ownerOnly: false },
  { key: 'caja', label: 'Caja', managerOnly: false, ownerOnly: false },
  // La cajera ve Ventas pero SOLO las de hoy (la vista se encarga de fijarlo).
  { key: 'ventas', label: 'Ventas', managerOnly: false, ownerOnly: false },
  { key: 'clientes', label: 'Clientes', managerOnly: false, ownerOnly: false },
  { key: 'inventario', label: 'Inventario', managerOnly: true, ownerOnly: false },
  { key: 'compras', label: 'Compras', managerOnly: true, ownerOnly: false },
];

export const TopBar: Component<{
  view: View;
  onNavigate: (view: View) => void;
}> = (props) => {
  const visibleViews = () =>
    VIEWS.filter(
      (item) => (!item.managerOnly || isManager()) && (!item.ownerOnly || isOwner()),
    );
  const [now, setNow] = createSignal(new Date());
  const [cashTick, setCashTick] = createSignal(0);
  const [cash] = createResource(
    () => ({ tick: cashTick(), version: cashRefreshVersion() }),
    cashInDrawer,
  );
  const [alert] = createResource(cashTick, deviceAlert);
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
      <Show when={alert()}>
        {(message) => (
          <span
            class={styles.chip}
            role="alert"
            style={{ background: 'var(--peligro)', color: '#fff' }}
          >
            ⚠ {message()}
          </span>
        )}
      </Show>
      <Show when={currentNotice() !== ''}>
        <span class={`${styles.chip} ${styles.aviso}`} role="status">
          {currentNotice()}
        </span>
      </Show>
      <Show when={isManager()}>
        <button
          type="button"
          class={`${styles.chip} ${styles.salir}`}
          classList={{ [styles.accesActivo]: props.view === 'ajustes' }}
          title="Ajustes: usuarios, equipos, voucher, IGV, categorías y proveedores"
          aria-label="Ajustes"
          onClick={() => props.onNavigate('ajustes')}
        >
          ⚙︎
        </button>
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
        {/* Si el nombre ES el rol («Encargado»), el chip repetido sobra. */}
        <Show
          when={
            (currentUser()?.name ?? '').toLocaleLowerCase() !==
            ROLE_LABEL[currentUser()?.role ?? 'cashier']
          }
        >
          <small>
            · {ROLE_LABEL[currentUser()?.role ?? 'cashier']}
          </small>
        </Show>
      </span>
      <button
        type="button"
        class={`${styles.chip} ${styles.salir}`}
        classList={{ [styles.accesActivo]: bigTextEnabled() }}
        title="Texto grande: normal → 115% → 130% (se recuerda por usuario)"
        aria-pressed={bigTextEnabled()}
        onClick={() => {
          const user = currentUser();
          if (user !== null) toggleBigText(user.id);
        }}
      >
        {bigTextLevel() === 2 ? 'A++' : 'A+'}
      </button>
      <button
        type="button"
        class={`${styles.chip} ${styles.salir}`}
        classList={{ [styles.accesActivo]: nightModeEnabled() }}
        title="Modo noche (se recuerda por usuario)"
        aria-pressed={nightModeEnabled()}
        onClick={() => {
          const user = currentUser();
          if (user !== null) toggleNightMode(user.id);
        }}
      >
        🌙
      </button>
      <button
        type="button"
        class={`${styles.chip} ${styles.salir}`}
        title="Bloquear pantalla (F10) — el ticket en curso se conserva"
        onClick={() => {
          // Revoca el token en el API y limpia el estado local; si el API no
          // responde, salir igual — la sesión expira sola a las 12h.
          void logoutSession().catch(() => undefined);
          endSession();
        }}
      >
        Salir
      </button>
      <span class={styles.reloj}>{clock()}</span>
    </header>
  );
};
