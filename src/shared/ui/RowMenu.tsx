import { createSignal, For, Show, type Component } from 'solid-js';

import styles from '@/shared/ui/ActionsMenu.module.css';

// Menú ⋯ genérico por fila: las acciones poco frecuentes no ocupan ancho.
export const RowMenu: Component<{
  items: Array<{ key: string; label: string }>;
  onSelect: (key: string) => void;
}> = (props) => {
  const [open, setOpen] = createSignal(false);

  return (
    <div class={styles.contenedor}>
      <button
        type="button"
        class={styles.boton}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label="Más operaciones"
        onClick={() => setOpen(!open())}
      >
        ⋯
      </button>
      <Show when={open()}>
        <div class={styles.fondo} onClick={() => setOpen(false)} />
        <div class={styles.lista} role="menu">
          <For each={props.items}>
            {(item) => (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.onSelect(item.key);
                }}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
