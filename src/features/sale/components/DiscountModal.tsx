import { For, createSignal, Show, type Component } from 'solid-js';

import { verifyManagerPin } from '@/shared/api/users';
import { beepError, beepOk } from '@/shared/lib/sounds';
import { roundToDimeCents, centsToSolesInput, DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { isManager } from '@/shared/state/session';
import type { TicketLine } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import {
  applyLineDiscount,
  markDiscountAuthorizedBy,
  setTicketDiscount,
  ticketDiscountCents,
  ticketLinesTotalCents,
} from '@/features/sale/state/ticket';
import styles from './DiscountModal.module.css';

// Espejo de la política del backend: hasta este % por línea la cajera decide
// sola; más que eso, o cualquier descuento al ticket, pide el PIN del encargado.
const MAX_LINE_DISCOUNT_PERCENT = 20;

export type DiscountTarget = { kind: 'line'; line: TicketLine } | { kind: 'ticket' };

export const DiscountModal: Component<{
  target: DiscountTarget;
  onClose: () => void;
}> = (props) => {
  const isLine = props.target.kind === 'line';
  const line = props.target.kind === 'line' ? props.target.line : null;

  const maxCents = () =>
    line !== null ? line.totalCents + line.discountCents : ticketLinesTotalCents();
  const currentCents = line !== null ? line.discountCents : ticketDiscountCents();

  const [amount, setAmount] = createSignal(
    currentCents > 0 ? centsToSolesInput(currentCents) : '',
  );
  const [pin, setPin] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const parsedCents = () => solesInputToCents(amount().trim() === '' ? '0' : amount());

  const needsManagerPin = () => {
    if (isManager()) return false;
    const cents = parsedCents();
    if (cents === null || cents === 0) return false;
    if (!isLine) return true;
    return cents * 100 > maxCents() * MAX_LINE_DISCOUNT_PERCENT;
  };

  const resultingCents = () => {
    const cents = parsedCents();
    if (cents === null) return null;
    return maxCents() - Math.min(cents, maxCents());
  };

  function applyDiscount(cents: number): boolean {
    return line !== null ? applyLineDiscount(line.lineId, cents) : setTicketDiscount(cents);
  }

  async function confirm(): Promise<void> {
    if (saving()) return;
    const cents = parsedCents();
    if (cents === null) {
      setError('Escribe un monto válido en soles.');
      return;
    }
    if (cents > maxCents()) {
      setError(`El descuento no puede pasar de ${formatSoles(maxCents())}.`);
      return;
    }
    if (!isDimeCents(cents)) {
      setError(DIME_MESSAGE);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (needsManagerPin()) {
        if (pin().trim() === '') {
          setError('Ese descuento necesita el PIN del encargado.');
          return;
        }
        const verification = await verifyManagerPin(pin());
        markDiscountAuthorizedBy(verification.managerName, verification.approvalToken);
      }
      if (!applyDiscount(cents)) {
        setError('No se pudo aplicar el descuento. Revisa el monto.');
        return;
      }
      beepOk();
      props.onClose();
    } catch {
      beepError();
      setError('PIN incorrecto o sin permiso. Pide al encargado que lo digite.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={line !== null ? `Descuento — ${line.product.name}` : 'Descuento al ticket'}
      size="sm"
      onClose={props.onClose}
    >
      <div class={forms.form}>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="descuento-monto">
            Monto a rebajar (máx. {formatSoles(maxCents())})
          </label>
          <input
            id="descuento-monto"
            class={forms.input}
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            value={amount()}
            onInput={(event) => setAmount(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirm();
            }}
            autofocus
          />
          {/* El botón que abre este modal dice "%": los porcentajes usuales a
              un toque; el monto libre sigue disponible abajo. */}
          <div class={styles.porcentajes}>
            <For each={[5, 10, 15, 20, 50]}>
              {(percent) => (
                <button
                  type="button"
                  class={styles.porcentaje}
                  onClick={() => setAmount(((roundToDimeCents(Math.round((maxCents() * percent) / 100)) / 100).toFixed(2)))}
                >
                  {percent} %
                </button>
              )}
            </For>
          </div>
          <Show when={resultingCents() !== null}>
            <p class={forms.nota}>
              {line !== null ? 'La línea queda en' : 'El ticket queda en'}{' '}
              <strong>{formatSoles(resultingCents() ?? 0)}</strong>
            </p>
          </Show>
        </div>

        <Show when={needsManagerPin()}>
          <div class={forms.campo}>
            <label class={forms.etiqueta} for="descuento-pin">
              PIN del encargado
            </label>
            <input
              id="descuento-pin"
              class={forms.input}
              type="password"
              inputmode="numeric"
              autocomplete="off"
              placeholder="····"
              value={pin()}
              onInput={(event) => setPin(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirm();
              }}
            />
            <p class={forms.nota}>
              {isLine
                ? `Más del ${MAX_LINE_DISCOUNT_PERCENT}% de la línea lo autoriza el encargado.`
                : 'El descuento a todo el ticket lo autoriza el encargado.'}
            </p>
          </div>
        </Show>

        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>

        <div class={forms.acciones}>
          <Show when={currentCents > 0}>
            <button
              type="button"
              class={`${forms.secundario} ${styles.quitar}`}
              disabled={saving()}
              onClick={() => {
                applyDiscount(0);
                props.onClose();
              }}
            >
              Quitar descuento
            </button>
          </Show>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={saving()}
            onClick={() => void confirm()}
          >
            {saving() ? 'Aplicando…' : 'Aplicar descuento'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
