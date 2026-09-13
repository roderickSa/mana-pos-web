import { Match, Switch, type Component } from 'solid-js';
import { useLocation } from '@solidjs/router';

import { activeTabPath, SubTabs, type SubTab } from '@/shared/ui/SubTabs';
import { CategoriesTab } from './components/CategoriesTab';
import { ProductsTab } from './components/ProductsTab';
import styles from '@/shared/ui/tabla.module.css';

// Catálogo (qué vendemos y a cuánto) separado del stock (cuánto hay): son
// dos tareas distintas del encargado y dos módulos distintos del API.
const TABS: readonly SubTab[] = [
  { path: '/productos', label: 'Productos' },
  { path: '/productos/categorias', label: 'Categorías' },
];

export const CatalogView: Component = () => {
  const location = useLocation();
  const tab = () => activeTabPath(TABS, location.pathname);

  return (
    <section class={styles.contenedorTabs}>
      <SubTabs tabs={TABS} label="Secciones de productos" />

      <Switch>
        <Match when={tab() === '/productos/categorias'}>
          <CategoriesTab />
        </Match>
        <Match when={tab() === '/productos'}>
          <ProductsTab />
        </Match>
      </Switch>
    </section>
  );
};
