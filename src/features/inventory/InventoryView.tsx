import { Match, Switch, type Component } from 'solid-js';
import { useLocation } from '@solidjs/router';

import { activeTabPath, SubTabs, type SubTab } from '@/shared/ui/SubTabs';
import { AdjustmentsTab } from './components/AdjustmentsTab';
import { CountTab } from './components/CountTab';
import { ExpiringTab } from './components/ExpiringTab';
import { KardexTab } from './components/KardexTab';
import styles from '@/shared/ui/tabla.module.css';

// Solo stock: entradas y mermas, vencimientos y kardex. El catálogo
// (productos, precios, categorías) vive en Productos.
const TABS: readonly SubTab[] = [
  { path: '/inventario/entradas', label: 'Entradas y mermas' },
  { path: '/inventario/conteo', label: 'Conteo físico' },
  { path: '/inventario/por-vencer', label: 'Por vencer' },
  { path: '/inventario/kardex', label: 'Kardex' },
];

export const InventoryView: Component = () => {
  const location = useLocation();
  const tab = () => activeTabPath(TABS, location.pathname);

  return (
    <section class={styles.contenedorTabs}>
      <SubTabs tabs={TABS} label="Secciones de inventario" />

      <Switch>
        <Match when={tab() === '/inventario/conteo'}>
          <CountTab />
        </Match>
        <Match when={tab() === '/inventario/por-vencer'}>
          <ExpiringTab />
        </Match>
        <Match when={tab() === '/inventario/kardex'}>
          <KardexTab />
        </Match>
        <Match when={tab() === '/inventario/entradas'}>
          <AdjustmentsTab />
        </Match>
      </Switch>
    </section>
  );
};
