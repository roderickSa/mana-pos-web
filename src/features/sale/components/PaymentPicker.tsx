import { For, type Component } from 'solid-js';

import styles from './PaymentPicker.module.css';

export const PAYMENT_METHODS = ['Efectivo', 'Yape', 'Tarjeta', 'Fiado'];

export const PaymentPicker: Component<{
  selected: string;
  onSelect: (method: string) => void;
}> = (props) => (
  <div class={styles.pagos} role="radiogroup" aria-label="Forma de pago">
    <For each={PAYMENT_METHODS}>
      {(method) => (
        <button
          type="button"
          role="radio"
          aria-checked={props.selected === method}
          class={styles.pago}
          classList={{ [styles.sel]: props.selected === method }}
          onClick={() => props.onSelect(method)}
        >
          {method}
        </button>
      )}
    </For>
  </div>
);
