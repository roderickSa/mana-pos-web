import { Show, type Component, type JSX } from 'solid-js';

import styles from '@/shared/ui/EmptyState.module.css';

// Una tabla en blanco no dice si no hay datos o si algo falló. Esto sí.
export const EmptyState: Component<{
  title?: string;
  message: string;
  action?: JSX.Element;
}> = (props) => (
  <div class={styles.vacio}>
    <Show when={props.title}>{(title) => <p class={styles.titulo}>{title()}</p>}</Show>
    <p class={styles.mensaje}>{props.message}</p>
    <Show when={props.action}>{(action) => action()}</Show>
  </div>
);
