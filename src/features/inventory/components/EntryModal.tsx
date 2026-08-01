import { createSignal, Show, type Component } from 'solid-js';

import { registerEntry } from '@/shared/api/inventory';
import { solesInputToCents } from '@/shared/lib/money';
import { beepError } from '@/shared/lib/sounds';
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
  const [unitCost, setUnitCost] = createSignal('');
  const [expiry, setExpiry] = createSignal('');
  const [error, setError] = createSignal('');

  const costUnitLabel = () => (props.product.saleType === 'weight' ? 'por kg' : 'por unidad');

  async function save(): Promise<void> {
    const value = Number.parseInt(quantity(), 10);
    if (Number.isNaN(value) || value <= 0) return;
    const costCents = unitCost().trim() === '' ? null : solesInputToCents(unitCost());
    if (costCents !== null && costCents <= 0) {
      setError('El costo debe ser mayor a cero, o déjalo vacío.');
      return;
    }
    try {
      await registerEntry(
        props.product.id,
        value,
        costCents,
        expiry().trim() === '' ? null : expiry(),
      );
      props.onDone(
        `Entrada registrada: +${value} ${unitLabel(props.product)}${
          costCents === null ? '' : ' — costo actualizado'
        }`,
      );
    } catch {
      beepError();
      setError('No se pudo registrar la entrada.');
    }
  }

  return (
    <Modal title={`Entrada de mercancía — ${props.product.name}`} onClose={props.onClose}>
      <div class={styles.form}>
        <div class={styles.fila}>
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
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Costo S/ {costUnitLabel()} (opcional)</span>
            <input
              class={styles.input}
              type="number"
              step="0.10"
              min="0"
              placeholder="lo que pagaste"
              value={unitCost()}
              onInput={(event) => setUnitCost(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && save()}
            />
          </div>
        </div>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Fecha de vencimiento (opcional)</span>
          <input
            class={styles.input}
            type="date"
            value={expiry()}
            onInput={(event) => setExpiry(event.currentTarget.value)}
          />
        </div>
        <p class={styles.nota}>
          Si capturas el costo, el margen se calcula con este costo de última compra. La fecha de
          vencimiento alimenta la pestaña «Por vencer».
        </p>
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
