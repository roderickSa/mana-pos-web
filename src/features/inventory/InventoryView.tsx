import { createSignal, Match, Switch, type Component } from 'solid-js';

import { AdjustmentsTab } from './components/AdjustmentsTab';
import { ExpiringTab } from './components/ExpiringTab';
import { KardexTab } from './components/KardexTab';
import { ProductsTab } from './components/ProductsTab';
import styles from '@/shared/ui/tabla.module.css';

// Cuatro pestañas ordenadas por frecuencia de uso: consulta diaria →
// operación diaria → alerta periódica → auditoría. Los catálogos maestros
// (categorías, proveedores) viven en Ajustes: se tocan una vez al mes.
type InventoryTab = 'productos' | 'ajustes' | 'vencer' | 'kardex';

const TABS: Array<{ key: InventoryTab; label: string }> = [
  { key: 'productos', label: 'Productos' },
  { key: 'ajustes', label: 'Ajustes de stock' },
  { key: 'vencer', label: 'Por vencer' },
  { key: 'kardex', label: 'Kardex' },
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
        <Match when={tab() === 'vencer'}>
          <ExpiringTab />
        </Match>
        <Match when={tab() === 'kardex'}>
          <KardexTab />
        </Match>
      </Switch>
    </section>
  );
};
