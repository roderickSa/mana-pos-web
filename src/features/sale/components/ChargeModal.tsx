import { createSignal, For, Match, Show, Switch, type Component } from 'solid-js';

import type { CheckoutResponseDto } from '@/shared/api/sales';
import { formatSoles } from '@/shared/lib/money';
import { Modal } from '@/shared/ui/Modal';
import styles from './ChargeModal.module.css';

// Denominaciones de soles en céntimos, para la sugerencia de billetes/monedas.
const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

export function suggestBills(changeCents: number): string[] {
  const parts: string[] = [];
  let remaining = changeCents;
  for (const denomination of DENOMINATIONS) {
    const count = Math.floor(remaining / denomination);
    if (count > 0) {
      parts.push(`${count} × ${formatSoles(denomination)}`);
      remaining -= count * denomination;
    }
  }
  return parts;
}

const QUICK_BILLS_CENTS = [1000, 2000, 5000, 10000, 20000];

export const ChargeModal: Component<{
  method: 'Efectivo' | 'Yape' | 'Tarjeta';
  totalCents: number;
  onConfirm: (receivedCents: number | null) => Promise<CheckoutResponseDto | null>;
  onClose: () => void;
}> = (props) => {
  const [received, setReceived] = createSignal('');
  const [charging, setCharging] = createSignal(false);
  const [done, setDone] = createSignal<CheckoutResponseDto | null>(null);

  const receivedCents = () => {
    const value = Number.parseFloat(received());
    return Number.isNaN(value) ? null : Math.round(value * 100);
  };

  const previewChange = () => {
    const cents = receivedCents();
    if (cents === null) return 0;
    return cents - props.totalCents;
  };

  async function confirm(exact = false): Promise<void> {
    if (charging()) return;
    const cents = props.method === 'Efectivo' && !exact ? receivedCents() : null;
    if (props.method === 'Efectivo' && !exact && cents !== null && cents < props.totalCents) return;
    setCharging(true);
    const result = await props.onConfirm(cents);
    setCharging(false);
    if (result !== null) {
      setDone(result);
    }
  }

  return (
    <Modal title={`Cobrar ${formatSoles(props.totalCents)} — ${props.method}`} onClose={props.onClose}>
      <Switch>
        <Match when={done() === null}>
          <div class={styles.cuerpo}>
            <Show when={props.method === 'Efectivo'}>
              <div class={styles.campo}>
                <span class={styles.etiqueta}>¿Con cuánto paga? (vacío = exacto)</span>
                <input
                  class={styles.recibido}
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder={ (props.totalCents / 100).toFixed(2) }
                  value={received()}
                  onInput={(event) => setReceived(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void confirm(received().trim() === '');
                    }
                  }}
                  autofocus
                />
              </div>
              <div class={styles.rapidos}>
                <button type="button" class={styles.rapido} onClick={() => void confirm(true)}>
                  Exacto
                </button>
                <For each={QUICK_BILLS_CENTS.filter((cents) => cents >= props.totalCents)}>
                  {(cents) => (
                    <button
                      type="button"
                      class={styles.rapido}
                      onClick={() => setReceived((cents / 100).toFixed(2))}
                    >
                      {formatSoles(cents)}
                    </button>
                  )}
                </For>
              </div>
              <Show when={receivedCents() !== null && previewChange() >= 0}>
                <div class={styles.vueltoPreview}>
                  Vuelto: <b>{formatSoles(previewChange())}</b>
                </div>
              </Show>
            </Show>

            <Show when={props.method !== 'Efectivo'}>
              <p class={styles.nota}>
                Confirma cuando el pago por {props.method} esté hecho. Solo se registra el método —
                sin integración, como definimos.
              </p>
            </Show>

            <div class={styles.acciones}>
              <button type="button" class={styles.cancelar} onClick={props.onClose}>
                Cancelar
              </button>
              <button
                type="button"
                class={styles.cobrar}
                disabled={charging()}
                onClick={() => void confirm(props.method !== 'Efectivo' || received().trim() === '')}
              >
                {charging() ? 'Cobrando…' : `Cobrar ${formatSoles(props.totalCents)}`}
              </button>
            </div>
          </div>
        </Match>

        <Match when={done()}>
          {(response) => (
            <div class={styles.cuerpo}>
              <p class={styles.ventaOk}>Venta #{response().number} cobrada ✓</p>
              <Show when={(response().changeCents ?? 0) > 0}>
                <div class={styles.vueltoGrande}>
                  <span>Vuelto</span>
                  <b>{formatSoles(response().changeCents ?? 0)}</b>
                  <span class={styles.billetes}>{suggestBills(response().changeCents ?? 0).join(' · ')}</span>
                </div>
              </Show>
              <Show when={response().printerWarning}>
                {(warning) => <p class={styles.aviso}>{warning()}</p>}
              </Show>
              <div class={styles.acciones}>
                <button
                  type="button"
                  class={styles.cobrar}
                  onClick={props.onClose}
                  onKeyDown={(event) => event.key === 'Enter' && props.onClose()}
                  autofocus
                >
                  Listo (Enter)
                </button>
              </div>
            </div>
          )}
        </Match>
      </Switch>
    </Modal>
  );
};
