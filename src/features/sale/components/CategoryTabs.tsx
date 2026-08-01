import { For, type Component } from 'solid-js';

import { activeCategories } from '@/shared/state/categories';
import styles from './CategoryTabs.module.css';

export const CategoryTabs: Component<{
  selected: string | null;
  onSelect: (key: string | null) => void;
}> = (props) => (
  <nav class={styles.tabs} aria-label="Categorías">
    <button
      type="button"
      class={styles.tab}
      classList={{ [styles.activa]: props.selected === '__mostrador' }}
      onClick={() => props.onSelect('__mostrador')}
    >
      ★ Mostrador
    </button>
    <button
      type="button"
      class={styles.tab}
      classList={{ [styles.activa]: props.selected === null }}
      onClick={() => props.onSelect(null)}
    >
      Todos
    </button>
    <For each={activeCategories()}>
      {(item) => (
        <button
          type="button"
          class={styles.tab}
          classList={{ [styles.activa]: props.selected === item.slug }}
          onClick={() => props.onSelect(item.slug)}
        >
          {item.name}
        </button>
      )}
    </For>
  </nav>
);
