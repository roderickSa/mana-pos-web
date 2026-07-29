import { createSignal, Show, type Component } from 'solid-js';

import { registerEntry } from '@/shared/api/inventory';
import { Modal } from '@/shared/ui/Modal';
import type { ProductDto } from '@/shared/types';
import { unitLabel } from './product-units';
import styles from '@/shared/ui/forms.module.css';

export const EntryModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [quantity, setQuantity] = createSignal('');
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    const value = Number.parseInt(quantity(), 10);
    if (Number.isNaN(value) || value <= 0) return;
    try {
      await registerEntry(props.product.id, value);
      props.onDone(`Entrada registrada: +${value} ${unitLabel(props.product)}`);
    } catch {
      setError('No se pudo registrar la entrada.');
    }
  }

  return (
    <Modal title={`Entrada de mercancía — ${props.product.name}`} onClose={props.onClose}>
      <div class={styles.form}>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Cantidad que llegó ({unitLabel(props.product)})</span>
          <input
            class={styles.input}
            type="number"
            min="1"
            value={quantity()}
            onInput={(event) => setQuantity(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && save()}
            autofocus
          />
        </div>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={styles.primario} onClick={save}>
            Registrar entrada
          </button>
        </div>
      </div>
    </Modal>
  );
};
