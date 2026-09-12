import { createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import { getScale } from '@/shared/api/devices';
import { formatKg, formatSoles } from '@/shared/lib/money';
import type { WeightProductDto } from '@/shared/types';
import { Keypad } from '@/shared/ui/Keypad';
import { Modal } from '@/shared/ui/Modal';
import styles from './WeightModal.module.css';

const PRESET_GRAMS = [100, 250, 500, 750, 1000];

export const WeightModal: Component<{
  product: WeightProductDto;
  onConfirm: (grams: number, source: 'scale' | 'manual') => void;
  onCancel: () => void;
}> = (props) => {
  const [grams, setGrams] = createSignal('');
  const [tick, setTick] = createSignal(0);
  const [scale] = createResource(tick, () => getScale().catch(() => null));

  // La balanza se lee en vivo mientras el modal está abierto.
  const interval = setInterval(() => setTick((value) => value + 1), 700);
  onCleanup(() => clearInterval(interval));

  const scaleGrams = () => {
    const state = scale();
    return state != null && state.connected && state.grams !== null && state.grams > 0
      ? state.grams
      : null;
  };

  function priceFor(value: number): number {
    return Math.round((value * props.product.pricePerKgCents) / 1000);
  }

  function confirmManual(): void {
    const value = Number.parseInt(grams(), 10);
    if (Number.isNaN(value) || value <= 0) return;
    props.onConfirm(value, 'manual');
  }

  function confirmFromScale(): void {
    const value = scaleGrams();
    if (value === null) return;
    props.onConfirm(value, 'scale');
  }

  const preview = () => {
    const value = Number.parseInt(grams(), 10);
    if (Number.isNaN(value) || value <= 0) return null;
    return formatSoles(priceFor(value));
  };

  return (
    <Modal
      size="sm"
      title={props.product.name}
      subtitle={`${formatSoles(props.product.pricePerKgCents)} por kilo`}
      onClose={props.onCancel}
      footer={
        <div class={styles.acciones}>
          <button type="button" class={styles.cancelar} onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" class={styles.confirmar} disabled={preview() === null} onClick={confirmManual}>
            Agregar {preview() ?? ''}
          </button>
        </div>
      }
    >
      <Show when={scaleGrams() !== null}>
        <button type="button" class={styles.balanzaViva} onClick={confirmFromScale}>
          <span class={styles.balanzaEtiqueta}>Balanza</span>
          <b>{formatKg(scaleGrams() ?? 0)}</b>
          <span>Usar este peso · {formatSoles(priceFor(scaleGrams() ?? 0))}</span>
        </button>
      </Show>
      <Show when={scaleGrams() === null && scale() != null}>
        <p class={styles.ayuda}>{scale()?.message ?? 'Balanza sin lectura — usa el peso manual.'}</p>
      </Show>

      <input
        class={styles.input}
        type="number"
        inputmode="numeric"
        placeholder="gramos, p. ej. 645"
        aria-label={`Gramos de ${props.product.name}`}
        value={grams()}
        onInput={(event) => setGrams(event.currentTarget.value)}
        onKeyDown={(event) => event.key === 'Enter' && confirmManual()}
        autofocus
      />
      <div class={styles.presets}>
        <For each={PRESET_GRAMS}>
          {(preset) => (
            <button type="button" class={styles.preset} onClick={() => setGrams(String(preset))}>
              {preset >= 1000 ? `${preset / 1000} kg` : `${preset} g`}
            </button>
          )}
        </For>
      </div>
      <Keypad value={grams()} onChange={setGrams} />
    </Modal>
  );
};
