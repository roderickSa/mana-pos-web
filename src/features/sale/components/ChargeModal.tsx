import { createSignal, For, Match, Show, Switch, type Component } from 'solid-js';
import { Keypad } from '@/shared/ui/Keypad';

import type { CheckoutResponseDto, PaymentPart } from '@/shared/api/sales';
import { CHARGE_METHOD_TO_API } from '@/shared/lib/labels';
import { DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { Modal } from '@/shared/ui/Modal';
import styles from './ChargeModal.module.css';

// Denominaciones de soles en céntimos, para la sugerencia de billetes/monedas.
const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

function suggestBills(changeCents: number): string[] {
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
  onConfirmSplit: (payments: PaymentPart[]) => Promise<CheckoutResponseDto | null>;
  onClose: () => void;
}> = (props) => {
  const [received, setReceived] = createSignal('');
  const [charging, setCharging] = createSignal(false);
  const [done, setDone] = createSignal<CheckoutResponseDto | null>(null);
  // Pago dividido: "paga 20 en efectivo y el resto con Yape".
  const [split, setSplit] = createSignal(false);
  const [secondMethod, setSecondMethod] = createSignal<'Efectivo' | 'Yape' | 'Tarjeta'>(
    props.method === 'Yape' ? 'Efectivo' : 'Yape',
  );
  const [secondAmount, setSecondAmount] = createSignal('');

  const receivedCents = () => {
    const value = Number.parseFloat(received());
    return Number.isNaN(value) ? null : Math.round(value * 100);
  };

  const previewChange = () => {
    const cents = receivedCents();
    if (cents === null) return 0;
    return cents - props.totalCents;
  };

  const secondCents = () => solesInputToCents(secondAmount()) ?? 0;
  const firstCents = () => props.totalCents - secondCents();
  const splitValid = () =>
    secondCents() > 0 && secondCents() < props.totalCents && isDimeCents(secondCents());
  // El efectivo peruano no baja de S/ 0.10: lo recibido va en pasos de 10 céntimos.
  const receivedIsDime = () => {
    const cents = receivedCents();
    return cents === null || isDimeCents(cents);
  };
  const otherMethods = () =>
    (['Efectivo', 'Yape', 'Tarjeta'] as const).filter((method) => method !== props.method);

  async function confirm(exact = false): Promise<void> {
    if (charging()) return;
    if (split()) {
      if (!splitValid()) return;
      setCharging(true);
      const result = await props.onConfirmSplit([
        { method: CHARGE_METHOD_TO_API[props.method], amountCents: firstCents() },
        { method: CHARGE_METHOD_TO_API[secondMethod()], amountCents: secondCents() },
      ]);
      setCharging(false);
      if (result !== null) setDone(result);
      return;
    }
    const cents = props.method === 'Efectivo' && !exact ? receivedCents() : null;
    if (props.method === 'Efectivo' && !exact && cents !== null && cents < props.totalCents) return;
    if (cents !== null && !isDimeCents(cents)) return;
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
            <Show when={split()}>
              <div class={styles.dividido}>
                <p class={styles.divididoTitulo}>
                  Pago dividido: {props.method} + otro método
                </p>
                <div class={styles.divididoFila}>
                  <select
                    class={styles.divididoSelect}
                    value={secondMethod()}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === 'Efectivo' || value === 'Yape' || value === 'Tarjeta') {
                        setSecondMethod(value);
                      }
                    }}
                  >
                    <For each={otherMethods()}>
                      {(method) => <option value={method}>{method}</option>}
                    </For>
                  </select>
                  <input
                    class={styles.recibido}
                    type="number"
                    step="0.10"
                    min="0"
                    placeholder="monto con este método"
                    value={secondAmount()}
                    onInput={(event) => setSecondAmount(event.currentTarget.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void confirm()}
                    autofocus
                  />
                </div>
                {/* Mismo teclado que el efectivo: una sola forma de teclear
                    montos en toda la pantalla de cobro. */}
                <Keypad value={secondAmount()} onChange={setSecondAmount} allowDecimal />
                <p class={styles.divididoResto} classList={{ [styles.divididoError]: !splitValid() && secondAmount() !== '' }}>
                  {splitValid()
                    ? `${props.method}: ${formatSoles(firstCents())} · ${secondMethod()}: ${formatSoles(secondCents())}`
                    : secondAmount() === ''
                      ? 'Ingresa cuánto paga con el segundo método.'
                      : !isDimeCents(secondCents())
                        ? DIME_MESSAGE
                        : 'El monto debe ser mayor a 0 y menor que el total.'}
                </p>
              </div>
            </Show>
            <Show when={!split() && props.method === 'Efectivo'}>
              <div class={styles.campo}>
                <span class={styles.etiqueta}>¿Con cuánto paga? (vacío = exacto)</span>
                {/* Sin monto de ejemplo como placeholder: un "5.70" gris se
                    lee como valor ya tecleado y el cajero cobra creyendo que
                    registró lo recibido. */}
                <input
                  class={styles.recibido}
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="pago exacto"
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
              <Keypad value={received()} onChange={setReceived} allowDecimal />
              <Show when={!receivedIsDime()}>
                <p class={styles.nota}>{DIME_MESSAGE}</p>
              </Show>
              <Show when={receivedIsDime() && receivedCents() !== null && previewChange() >= 0}>
                <div class={styles.vueltoPreview}>
                  Vuelto: <b>{formatSoles(previewChange())}</b>
                </div>
              </Show>
            </Show>

            <Show when={!split() && props.method !== 'Efectivo'}>
              <p class={styles.nota}>
                Confirma cuando el pago por {props.method} esté hecho. Solo se registra el método —
                sin integración, como definimos.
              </p>
            </Show>

            <button
              type="button"
              class={styles.divididoToggle}
              onClick={() => {
                setSplit((value) => !value);
                setSecondAmount('');
              }}
            >
              {split() ? '← Volver a un solo método' : '⇄ Pagar con dos métodos'}
            </button>

            <div class={styles.acciones}>
              <button type="button" class={styles.cancelar} onClick={props.onClose}>
                Cancelar
              </button>
              <button
                type="button"
                class={styles.cobrar}
                disabled={charging() || (split() && !splitValid())}
                onClick={() =>
                  void confirm(!split() && (props.method !== 'Efectivo' || received().trim() === ''))
                }
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
