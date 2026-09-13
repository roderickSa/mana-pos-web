import { createSignal, For, onCleanup, Show, type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';

import { sectionOf, sectionsFor, type Section } from '@/app/routes';

import { formatSoles } from '@/shared/lib/money';
import { cashInDrawerCents } from '@/shared/state/cash-status';
import { devicesStatus } from '@/shared/state/devices-status';
import { currentUser, endSession, isManager, type SessionUser } from '@/shared/state/session';
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
function deviceAlert(): string | null {
  const status = devicesStatus();
  if (status === undefined || status.mode !== 'real') return null;
  return status.scale.connected ? null : 'Balanza sin conexión';
}

const ROLE_LABEL: Record<'owner' | 'manager' | 'cashier', string> = {
  owner: 'dueño',
  manager: 'encargado',
  cashier: 'cajera',
};

// La cajera solo ve lo operativo; lo administrativo (reportes, costos,
// usuarios) es del encargado. Inicio (el pulso del negocio) es del dueño.
// Ajustes (con Equipos, Voucher, IGV y los catálogos maestros) va como engrane
// a la derecha: no es de uso diario. El orden y el permiso de cada sección
// viven en `app/routes.ts`; acá solo el nombre que se lee en pantalla.
const SECTION_LABELS: Record<Section, string> = {
  inicio: 'Inicio',
  venta: 'Vender',
  caja: 'Caja',
  // La cajera ve Historial pero SOLO las ventas de hoy (la vista lo fija).
  ventas: 'Historial',
  clientes: 'Clientes',
  productos: 'Productos',
  inventario: 'Inventario',
  compras: 'Compras',
  reportes: 'Reportes',
  ajustes: 'Ajustes',
};

export const TopBar: Component = () => {
  const location = useLocation();
  const role = (): SessionUser['role'] => currentUser()?.role ?? 'cashier';
  const visibleSections = () => sectionsFor(role());
  const activeSection = () => sectionOf(location.pathname);
  const [now, setNow] = createSignal(new Date());
  const cash = cashInDrawerCents;
  const alert = deviceAlert;
  const interval = setInterval(() => setNow(new Date()), 15_000);
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
        <For each={visibleSections()}>
          {(item) => (
            <A
              href={item.home}
              class={styles.navBoton}
              classList={{ [styles.navActiva]: activeSection() === item.section }}
            >
              {SECTION_LABELS[item.section]}
            </A>
          )}
        </For>
      </nav>

      <span class={styles.spacer} />
      <Show when={alert()}>
        {(message) => (
          <span
            class={styles.chip}
            role="alert"
            style={{ background: 'var(--peligro)', color: 'var(--tinta-sobre-relleno)' }}
          >
            ⚠ {message()}
          </span>
        )}
      </Show>
      <Show when={isManager()}>
        <A
          href="/ajustes/usuarios"
          class={`${styles.chip} ${styles.salir}`}
          classList={{ [styles.accesActivo]: activeSection() === 'ajustes' }}
          title="Ajustes: usuarios, equipos, voucher, IGV y respaldo"
          aria-label="Ajustes"
        >
          ⚙︎
        </A>
      </Show>
      <span
        class={`${styles.chip} ${styles.caja}`}
        classList={{ [styles.cajaCerrada]: cash() === null }}
        title="Efectivo real en el cajón: fondo + ventas + abonos − retiros − gastos. Se actualiza con cada operación."
      >
        {cash() === null ? 'Caja cerrada' : `Caja: ${formatSoles(cash() ?? 0)}`}
      </span>
      <span class={styles.chip}>
        <span class={styles.avatar}>{(currentUser()?.name ?? '?').charAt(0)}</span>
        <span class={styles.nombreUsuario}>{currentUser()?.name ?? '—'}</span>
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
