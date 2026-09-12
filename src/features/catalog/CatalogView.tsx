import { createSignal, Match, Switch, type Component } from 'solid-js';

import { CategoriesTab } from './components/CategoriesTab';
import { ProductsTab } from './components/ProductsTab';
import styles from '@/shared/ui/tabla.module.css';

// Catálogo (qué vendemos y a cuánto) separado del stock (cuánto hay): son
// dos tareas distintas del encargado y dos módulos distintos del API.
type CatalogTab = 'productos' | 'categorias';

const TABS: Array<{ key: CatalogTab; label: string }> = [
  { key: 'productos', label: 'Productos' },
  { key: 'categorias', label: 'Categorías' },
];

export const CatalogView: Component = () => {
  const [tab, setTab] = createSignal<CatalogTab>('productos');

  return (
    <section class={styles.contenedorTabs}>
      <nav class={styles.subnav} aria-label="Secciones de productos">
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
        <Match when={tab() === 'categorias'}>
          <CategoriesTab />
        </Match>
      </Switch>
    </section>
  );
};
