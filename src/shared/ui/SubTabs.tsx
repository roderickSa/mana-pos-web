import { For, type Component } from 'solid-js';
import { A, useLocation } from '@solidjs/router';

import styles from '@/shared/ui/tabla.module.css';

// Las subpestañas de una vista son rutas, no señales: así la recarga y el
// botón Atrás del navegador caen donde el usuario estaba. Seis vistas tenían
// esta misma barra copiada.
export interface SubTab {
  path: string;
  label: string;
}

// La pestaña activa es la de ruta más larga que calce: `/inventario/kardex`
// gana sobre `/inventario`, y una ruta hija (`/kardex/:ticketId`) sigue
// marcando su pestaña.
export function activeTabPath(tabs: readonly SubTab[], pathname: string): string {
  const matches = tabs.filter(
    (tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`),
  );
  const best = matches.reduce<SubTab | undefined>(
    (longest, tab) => (longest === undefined || tab.path.length > longest.path.length ? tab : longest),
    undefined,
  );
  return best?.path ?? tabs[0]?.path ?? '';
}

export const SubTabs: Component<{ tabs: readonly SubTab[]; label: string }> = (props) => {
  const location = useLocation();
  const active = () => activeTabPath(props.tabs, location.pathname);

  return (
    <nav class={styles.subnav} aria-label={props.label}>
      <For each={props.tabs}>
        {(tab) => (
          <A
            href={tab.path}
            class={styles.subtab}
            classList={{ [styles.subtabActiva]: active() === tab.path }}
          >
            {tab.label}
          </A>
        )}
      </For>
    </nav>
  );
};
