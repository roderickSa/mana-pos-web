import { createSignal, Match, Switch, type Component } from 'solid-js';

import { AdjustmentsTab } from './components/AdjustmentsTab';
import { KardexTab } from './components/KardexTab';
import { ProductsTab } from './components/ProductsTab';
import { SuppliersTab } from './components/SuppliersTab';
import styles from '@/shared/ui/tabla.module.css';

type InventoryTab = 'productos' | 'kardex' | 'proveedores' | 'ajustes';

const TABS: Array<{ key: InventoryTab; label: string }> = [
  { key: 'productos', label: 'Productos' },
  { key: 'ajustes', label: 'Ajustes de stock' },
  { key: 'kardex', label: 'Kardex' },
  { key: 'proveedores', label: 'Proveedores' },
];

export const InventoryView: Component = () => {
  const [tab, setTab] = createSignal<InventoryTab>('productos');

  return (
    <section class={styles.contenedorTabs}>
      <nav class={styles.subnav} aria-label="Secciones de inventario">
        {TABS.map((item) => (
          <button
            type="button"
            class={styles.subtab}
            classList={{ [styles.subtabActiva]: tab() === item.key }}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <Switch>
        <Match when={tab() === 'productos'}>
          <ProductsTab />
        </Match>
        <Match when={tab() === 'ajustes'}>
          <AdjustmentsTab />
        </Match>
        <Match when={tab() === 'kardex'}>
          <KardexTab />
        </Match>
        <Match when={tab() === 'proveedores'}>
          <SuppliersTab />
        </Match>
      </Switch>
    </section>
  );
};
