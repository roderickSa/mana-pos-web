import { createSignal, For, Show, type Component } from 'solid-js';

import styles from '@/shared/ui/ActionsMenu.module.css';

// Solo lo del producto en sí: entradas/mermas/conteos viven en el tab Ajustes,
// y el histórico en el tab Kardex.
export type ProductAction = 'price' | 'stock' | 'edit' | 'merge';

const ACTIONS: Array<{ key: ProductAction; label: string }> = [
  { key: 'price', label: 'Actualizar precio' },
  { key: 'stock', label: 'Actualizar stock' },
  { key: 'edit', label: 'Editar producto' },
  { key: 'merge', label: 'Fusionar duplicado…' },
];

export const ActionsMenu: Component<{ onSelect: (action: ProductAction) => void }> = (props) => {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={styles.contenedor}>
      <button
        type="button"
        class={styles.boton}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        Acciones ▾
      </button>
      <Show when={open()}>
        <div class={styles.fondo} onClick={() => setOpen(false)} />
        <div class={styles.lista} role="menu">
          <For each={ACTIONS}>
            {(action) => (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.onSelect(action.key);
                }}
              >
                {action.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
