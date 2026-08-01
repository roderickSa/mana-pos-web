import { For, Show, type Component } from 'solid-js';

import styles from './Keypad.module.css';

// Teclado numérico en pantalla para la operación táctil: edita el mismo
// valor que el input al que acompaña, así el teclado físico sigue
// funcionando en paralelo. Teclas grandes (60px) para dedos, no cursores.
export const Keypad: Component<{
  value: string;
  onChange: (value: string) => void;
  allowDecimal?: boolean;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
}> = (props) => {
  function press(key: string): void {
    if (key === '⌫') {
      props.onChange(props.value.slice(0, -1));
      return;
    }
    if (key === 'C') {
      props.onChange('');
      return;
    }
    if (key === '.') {
      if (props.value.includes('.')) return;
      props.onChange(props.value === '' ? '0.' : `${props.value}.`);
      return;
    }
    props.onChange(props.value + key);
  }

  const keys = () => [
    '7', '8', '9',
    '4', '5', '6',
    '1', '2', '3',
    props.allowDecimal === true ? '.' : 'C', '0', '⌫',
  ];

  return (
    <div class={styles.keypad}>
      <For each={keys()}>
        {(key) => (
          <button
            type="button"
            class={styles.tecla}
            aria-label={key === '⌫' ? 'Borrar' : key === 'C' ? 'Limpiar' : key}
            onClick={() => press(key)}
          >
            {key}
          </button>
        )}
      </For>
      <Show when={props.onConfirm}>
        {(confirm) => (
          <button
            type="button"
            class={styles.confirmar}
            disabled={props.confirmDisabled === true}
            onClick={() => confirm()()}
          >
            {props.confirmLabel ?? 'Confirmar'}
          </button>
        )}
      </Show>
    </div>
  );
};
