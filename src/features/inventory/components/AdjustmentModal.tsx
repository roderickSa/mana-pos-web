import { createSignal, Show, type Component } from 'solid-js';

import { apiErrorMessage, ApiError } from '@/shared/api/client';
import { registerAdjustment } from '@/shared/api/inventory';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import type { ProductDto } from '@/shared/types';
import { unitLabel } from '@/shared/lib/product-units';
import styles from '@/shared/ui/forms.module.css';

const ADJUSTMENT_KINDS = [
  { value: 'waste', label: 'Merma (se malogró)' },
  { value: 'expiry', label: 'Caducidad (venció)' },
  { value: 'theft', label: 'Robo / pérdida' },
] as const;

export const AdjustmentModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [kind, setKind] = createSignal<'waste' | 'expiry' | 'theft'>('waste');
  const [quantity, setQuantity] = createSignal('');
  const [reason, setReason] = createSignal('');
  const [error, setError] = createSignal('');

  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving()) return;
    const value = Number.parseInt(quantity(), 10);
    if (Number.isNaN(value) || value <= 0) return;
    setSaving(true);
    try {
      await registerAdjustment(
        props.product.id,
        kind(),
        value,
        reason().trim() === '' ? null : reason().trim(),
      );
      props.onDone(`Ajuste registrado: −${value} ${unitLabel(props.product)}`);
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.code === 'ADJUSTMENT_EXCEEDS_STOCK') {
        setError('La cantidad supera el stock disponible. Verifica y vuelve a intentar.');
      } else {
        setError(apiErrorMessage(cause, 'No se pudo registrar el ajuste.'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={`Merma / ajuste — ${props.product.name}`}
      onClose={props.onClose}
      footer={
        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={styles.primario} disabled={saving()} onClick={save}>
            Registrar ajuste
          </button>
        </div>
      }
    >
      <div class={styles.form}>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Motivo</span>
          <select
            class={styles.select}
            value={kind()}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'waste' || value === 'expiry' || value === 'theft') setKind(value);
            }}
          >
            {ADJUSTMENT_KINDS.map((option) => (
              <option value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Cantidad a retirar ({unitLabel(props.product)})</span>
          <input
            class={styles.input}
            type="number"
            min="1"
            value={quantity()}
            onInput={(event) => setQuantity(event.currentTarget.value)}
            autofocus
          />
        </div>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Detalle (opcional)</span>
          <input
            class={styles.input}
            value={reason()}
            onInput={(event) => setReason(event.currentTarget.value)}
            placeholder="p. ej. se rompió la bolsa"
          />
        </div>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};
