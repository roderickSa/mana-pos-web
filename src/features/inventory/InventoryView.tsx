import { createSignal, Match, Switch, type Component } from 'solid-js';

import { AdjustmentsTab } from './components/AdjustmentsTab';
import { CountTab } from './components/CountTab';
import { ExpiringTab } from './components/ExpiringTab';
import { KardexTab } from './components/KardexTab';
import styles from '@/shared/ui/tabla.module.css';

// Solo stock: entradas y mermas, vencimientos y kardex. El catálogo
// (productos, precios, categorías) vive en Productos.
type InventoryTab = 'ajustes' | 'conteo' | 'vencer' | 'kardex';

const TABS: Array<{ key: InventoryTab; label: string }> = [
  { key: 'ajustes', label: 'Entradas y mermas' },
  { key: 'conteo', label: 'Conteo físico' },
  { key: 'vencer', label: 'Por vencer' },
  { key: 'kardex', label: 'Kardex' },
];

export const InventoryView: Component = () => {
  const [tab, setTab] = createSignal<InventoryTab>('ajustes');

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
        <Match when={tab() === 'ajustes'}>
          <AdjustmentsTab onGoToKardex={() => setTab('kardex')} />
        </Match>
        <Match when={tab() === 'conteo'}>
          <CountTab />
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
