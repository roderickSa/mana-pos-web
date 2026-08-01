import { createResource, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';

import { getScale } from '@/shared/api/devices';
import { formatKg, formatSoles } from '@/shared/lib/money';
import type { WeightProductDto } from '@/shared/types';
import { Keypad } from '@/shared/ui/Keypad';
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

  // Esc cancela, igual que en el resto de modales.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onCancel();
    }
  }
  onMount(() => document.addEventListener('keydown', onKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  const scaleGrams = () => {
    const state = scale();
    return state != null && state.connected && state.grams !== null && state.grams > 0
      ? state.grams
      : null;
  };

  function priceFor(value: number): number {
    return Math.round((value / 1000) * props.product.pricePerKgCents);
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
    <div class={styles.fondo} onClick={props.onCancel}>
      <div
        class={styles.modal}
        role="dialog"
        aria-label={`Peso de ${props.product.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 class={styles.titulo}>{props.product.name}</h3>
        <p class={styles.ayuda}>{formatSoles(props.product.pricePerKgCents)} por kilo</p>

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
        <div class={styles.acciones}>
          <button type="button" class={styles.cancelar} onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" class={styles.confirmar} disabled={preview() === null} onClick={confirmManual}>
            Agregar {preview() ?? ''}
          </button>
        </div>
      </div>
    </div>
  );
};
