import { Show, type Component } from 'solid-js';

import styles from './SearchBox.module.css';

export const SearchBox: Component<{
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  setRef: (element: HTMLInputElement) => void;
  multiplier: number;
}> = (props) => (
  <form
    class={styles.form}
    onSubmit={(event) => {
      event.preventDefault();
      props.onSubmit();
    }}
  >
    <input
      ref={(element) => props.setRef(element)}
      class={styles.input}
      type="text"
      placeholder="Escanea un código o busca un producto…  (F2)"
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
    <Show when={props.multiplier > 1}>
      <span class={styles.mult} title="El siguiente producto entra con esta cantidad">
        ×{props.multiplier}
      </span>
    </Show>
    <span class={styles.armado} aria-hidden="true" title="Listo para escanear" />
  </form>
);
