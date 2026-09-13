import { createSignal, Show, type Component } from 'solid-js';

import { setCount } from '@/shared/api/inventory';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import type { ProductDto } from '@/shared/types';
import { stockOf, unitLabel } from '@/shared/lib/product-units';
import styles from '@/shared/ui/forms.module.css';
import { apiErrorMessage } from '@/shared/api/client';

export const CountModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [counted, setCounted] = createSignal('');
  const [error, setError] = createSignal('');

  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving()) return;
    const value = Number.parseInt(counted(), 10);
    if (Number.isNaN(value) || value < 0) return;
    setSaving(true);
    try {
      const result = await setCount(props.product.id, value);
      const label =
        result.difference === 0
          ? 'el conteo coincide con el sistema'
          : `diferencia de ${result.difference > 0 ? '+' : ''}${result.difference}`;
      props.onDone(`Stock actualizado: ${label}`);
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo actualizar el stock.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={`Actualizar stock — ${props.product.name}`}
      onClose={props.onClose}
      footer={
        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={styles.primario} disabled={saving()} onClick={save}>
            Actualizar stock
          </button>
        </div>
      }
    >
      <div class={styles.form}>
        <p class={styles.nota}>
          El sistema registra <b>{stockOf(props.product)}</b> {unitLabel(props.product)}. Escribe la
          cantidad real y se ajusta la diferencia (queda en el kardex como conteo).
        </p>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Cantidad real ({unitLabel(props.product)})</span>
          <input
            class={styles.input}
            type="number"
            min="0"
            value={counted()}
            onInput={(event) => setCounted(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && save()}
            autofocus
          />
        </div>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};
