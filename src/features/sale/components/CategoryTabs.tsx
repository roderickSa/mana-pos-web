import { For, type Component } from 'solid-js';

import { CATEGORIES } from '@/shared/lib/categories';
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
    <For each={CATEGORIES}>
      {(item) => (
        <button
          type="button"
          class={styles.tab}
          classList={{ [styles.activa]: props.selected === item.key }}
          onClick={() => props.onSelect(item.key)}
        >
          {item.label}
        </button>
      )}
    </For>
  </nav>
);
