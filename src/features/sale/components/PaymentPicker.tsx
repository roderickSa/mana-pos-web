import { For, type Component } from 'solid-js';

import styles from './PaymentPicker.module.css';

export const PAYMENT_METHODS = ['Efectivo', 'Yape', 'Tarjeta', 'Fiado'];

// Atajos de método de pago: F5/F6/F7 (Efectivo es el default al abrir).
export const PAYMENT_SHORTCUTS: Record<string, string> = {
  Yape: 'F5',
  Tarjeta: 'F6',
  Fiado: 'F7',
};

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
          {PAYMENT_SHORTCUTS[method] !== undefined ? (
            <kbd class={styles.atajo}>{PAYMENT_SHORTCUTS[method]}</kbd>
          ) : null}
        </button>
      )}
    </For>
  </div>
);
