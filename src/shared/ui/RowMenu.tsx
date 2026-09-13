import { createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import styles from '@/shared/ui/RowMenu.module.css';

// Las acciones poco frecuentes de una fila no deben ocupar ancho: viven detrás
// de un gatillo. «peligro» es para lo que destruye algo (cancelar, borrar).
export type RowMenuItem = { key: string; label: string; tone?: 'normal' | 'peligro' };

export const RowMenu: Component<{
  items: RowMenuItem[];
  onSelect: (key: string) => void;
  label?: string;
  ariaLabel?: string;
}> = (props) => {
  const [open, setOpen] = createSignal(false);

  // Escape cierra el menú esté donde esté el foco: es la salida que todos
  // esperan y evita dejarlo abierto tapando la fila de abajo.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') setOpen(false);
  }
  document.addEventListener('keydown', onKeyDown);
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  return (
    <div class={styles.contenedor}>
      <button
        type="button"
        class={styles.boton}
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label={props.ariaLabel ?? 'Más operaciones'}
        onClick={() => setOpen(!open())}
      >
        {props.label ?? '⋯'}
      </button>
      <Show when={open()}>
        <div class={styles.fondo} onClick={() => setOpen(false)} />
        <div class={styles.lista} role="menu">
          <For each={props.items}>
            {(item) => (
              <button
                type="button"
                role="menuitem"
                classList={{ [styles.peligro]: item.tone === 'peligro' }}
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
