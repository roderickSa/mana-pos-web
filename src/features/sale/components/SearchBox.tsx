import type { Component } from 'solid-js';

import styles from './SearchBox.module.css';

export const SearchBox: Component<{
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  setRef?: (element: HTMLInputElement) => void;
}> = (props) => (
  <form
    class={styles.form}
    onSubmit={(event) => {
      event.preventDefault();
      props.onSubmit();
    }}
  >
    <input
      ref={(element) => props.setRef?.(element)}
      class={styles.input}
      type="text"
      placeholder="Escanea un código o busca un producto…  (F2)"
      value={props.value}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  </form>
);
