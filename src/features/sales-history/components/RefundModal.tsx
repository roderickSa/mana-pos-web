import {createSignal, For, Show, type Component } from 'solid-js';

import {refundTicketRequest, type TicketDetailDto, type RefundDto } from '@/shared/api/sales';
import {formatKg, formatSoles } from '@/shared/lib/money';
import {beepError } from '@/shared/lib/sounds';
import {ApiError, apiErrorMessage } from '@/shared/api/client';
import {isManager } from '@/shared/state/session';
import {verifyManagerPin } from '@/shared/api/users';
import {Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import styles from '../SalesHistoryView.module.css';
import {REFUND_REASONS } from './sales-history.helpers';

export const RefundModal: Component<{
  ticket: TicketDetailDto;
  onDone: (refund: RefundDto, printerWarning: string | null) => void;
  onClose: () => void;
}> = (props) => {
  const [quantities, setQuantities] = createSignal<Record<string, number>>({});
  const [reason, setReason] = createSignal('');
  const [pin, setPin] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const refundedByLine = () => {
    const map: Record<string, number> = {};
    for (const refund of props.ticket.refunds) {
      for (const line of refund.lines) {
        map[line.ticketLineId] = (map[line.ticketLineId] ?? 0) + line.quantity;
      }
    }
    return map;
  };

  const refundedAmountByLine = () => {
    const map: Record<string, number> = {};
    for (const refund of props.ticket.refunds) {
      for (const line of refund.lines) {
        map[line.ticketLineId] = (map[line.ticketLineId] ?? 0) + line.amountCents;
      }
    }
    return map;
  };

  const soldOf = (line: TicketDetailDto['lines'][number]) => line.grams ?? line.quantity ?? 0;
  const remainingOf = (line: TicketDetailDto['lines'][number]) =>
    soldOf(line) - (refundedByLine()[line.id] ?? 0);
  const quantityOf = (lineId: string) => quantities()[lineId] ?? 0;

  function setQuantity(line: TicketDetailDto['lines'][number], value: number): void {
    const clamped = Math.max(0, Math.min(remainingOf(line), Math.round(value)));
    setQuantities({ ...quantities(), [line.id]: clamped });
  }

  // Estimación con la misma regla del servidor: montos por línea EXACTOS al
  // céntimo (proporcionales a lo pagado, descuentos y redondeo incluidos) y el
  // redondeo a S/0.10 UNA sola vez sobre el total de la tanda. Si la tanda
  // deja todo devuelto, paga exactamente lo que faltaba.
  const estimateParts = () => {
    const roundToDime = (cents: number) => Math.round(cents / 10) * 10;
    const factor =
      props.ticket.linesTotalCents > 0
        ? props.ticket.totalCents / props.ticket.linesTotalCents
        : 1;
    const exact = props.ticket.lines.reduce((sum, line) => {
      const quantity = quantityOf(line.id);
      const sold = soldOf(line);
      if (quantity <= 0 || sold <= 0) return sum;
      const lineCap = Math.round(line.totalCents * factor);
      const alreadyPaid = refundedAmountByLine()[line.id] ?? 0;
      const remainingMoney = Math.max(0, lineCap - alreadyPaid);
      const amount =
        quantity === remainingOf(line)
          ? remainingMoney
          : Math.min(Math.round(((line.totalCents * quantity) / sold) * factor), remainingMoney);
      return sum + amount;
    }, 0);
    const remaining = Math.max(0, props.ticket.totalCents - props.ticket.refundedCents);
    const completesEverything = props.ticket.lines.every(
      (line) => quantityOf(line.id) >= remainingOf(line),
    );
    const payout = completesEverything ? remaining : Math.min(roundToDime(exact), remaining);
    return { exact, payout };
  };

  const estimateCents = () => estimateParts().payout;
  // El cajero ve cuando el pago fue redondeado a S/0.10 (solo si aplica).
  const estimateRounding = () => estimateParts().payout - estimateParts().exact;

  const anySelected = () => props.ticket.lines.some((line) => quantityOf(line.id) > 0);
  const paidWithCredit = () => props.ticket.payments.some((payment) => payment.method === 'credit');

  async function confirm(): Promise<void> {
    if (saving()) return;
    const trimmedReason = reason().trim();
    if (trimmedReason.length < 3) {
      setError('Indica el motivo de la devolución.');
      return;
    }
    const lines = props.ticket.lines
      .filter((line) => quantityOf(line.id) > 0)
      .map((line) => ({ ticketLineId: line.id, quantity: quantityOf(line.id) }));
    if (lines.length === 0) {
      setError('Elige al menos un producto a devolver.');
      return;
    }
    // Una devolución que paga S/ 0.00 es casi seguro un error de cantidad
    // (p. ej. 4 gramos en vez de todo el peso).
    if (estimateCents() === 0 && props.ticket.totalCents > 0) {
      setError('Lo elegido no llega ni a S/ 0.10 — revisa la cantidad (los pesables van en gramos).');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Devolver saca plata de caja: si quien opera no es encargado, exige su PIN.
      let approvalToken: string | null = null;
      if (!isManager()) {
        approvalToken = (await verifyManagerPin(pin())).approvalToken;
      }
      const refund = await refundTicketRequest(props.ticket.id, lines, trimmedReason, approvalToken);
      props.onDone(refund, refund.printerWarning ?? null);
    } catch (cause) {
      beepError();
      setError(
        cause instanceof ApiError && cause.serverMessage !== null
          ? cause.serverMessage
          : apiErrorMessage(cause, 'No se pudo registrar la devolución. Revisa el PIN e intenta de nuevo.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="lg"
      title={`Devolver de la venta #${props.ticket.number}`}
      dismissOnBackdrop={false}
      onClose={props.onClose}
    >
      <div class={forms.form}>
        <p class={forms.nota}>
          {paidWithCredit()
            ? 'Venta fiada: lo devuelto se abona a la deuda del cliente y el stock vuelve al inventario.'
            : 'Lo devuelto se paga en efectivo desde la caja y el stock vuelve al inventario.'}
        </p>

        <table class={styles.detalleTabla}>
          <tbody>
            <For each={props.ticket.lines}>
              {(line) => (
                <tr>
                  <td>
                    {line.description}
                    <span class={styles.detalleSub}>
                      {line.grams !== null
                        ? ` vendido ${formatKg(soldOf(line))} · queda ${formatKg(remainingOf(line))}`
                        : ` vendido ${soldOf(line)} · queda ${remainingOf(line)}`}
                    </span>
                  </td>
                  <td class={styles.detalleMonto}>
                    <Show
                      when={line.grams !== null}
                      fallback={
                        <span class={styles.devolverPasos}>
                          <button
                            type="button"
                            aria-label={`Una menos de ${line.description}`}
                            disabled={quantityOf(line.id) <= 0}
                            onClick={() => setQuantity(line, quantityOf(line.id) - 1)}
                          >
                            −
                          </button>
                          <b>{quantityOf(line.id)}</b>
                          <button
                            type="button"
                            aria-label={`Una más de ${line.description}`}
                            disabled={quantityOf(line.id) >= remainingOf(line)}
                            onClick={() => setQuantity(line, quantityOf(line.id) + 1)}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            class={styles.devolverTodo}
                            disabled={remainingOf(line) <= 0 || quantityOf(line.id) === remainingOf(line)}
                            onClick={() => setQuantity(line, remainingOf(line))}
                          >
                            Todo
                          </button>
                        </span>
                      }
                    >
                      <span class={styles.devolverPasos}>
                        <input
                          class={forms.input}
                          type="number"
                          inputmode="numeric"
                          min="0"
                          max={remainingOf(line)}
                          style={{ width: '6.5rem' }}
                          value={quantityOf(line.id) === 0 ? '' : quantityOf(line.id)}
                          placeholder="gramos"
                          aria-label={`Gramos a devolver de ${line.description}`}
                          onInput={(event) => setQuantity(line, Number(event.currentTarget.value))}
                        />{' '}
                        g
                        <button
                          type="button"
                          class={styles.devolverTodo}
                          disabled={remainingOf(line) <= 0 || quantityOf(line.id) === remainingOf(line)}
                          onClick={() => setQuantity(line, remainingOf(line))}
                        >
                          Todo
                        </button>
                      </span>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <div class={forms.campo}>
          <span class={forms.etiqueta}>Motivo (obligatorio)</span>
          <div class={styles.motivos}>
            <For each={REFUND_REASONS}>
              {(quick) => (
                <button
                  type="button"
                  classList={{ [styles.motivoActivo]: reason() === quick }}
                  onClick={() => setReason(quick)}
                >
                  {quick}
                </button>
              )}
            </For>
          </div>
          <input
            class={forms.input}
            type="text"
            placeholder="o escribe el motivo…"
            maxLength={200}
            value={reason()}
            onInput={(event) => setReason(event.currentTarget.value)}
          />
        </div>

        <Show when={!isManager()}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>PIN del encargado</span>
            <input
              class={forms.input}
              type="password"
              inputmode="numeric"
              maxLength={6}
              value={pin()}
              onInput={(event) => setPin(event.currentTarget.value.replace(/\D/g, ''))}
            />
          </div>
        </Show>

        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>

        <Show when={anySelected() && estimateRounding() !== 0}>
          <p class={forms.nota}>
            Exacto {formatSoles(estimateParts().exact)} · redondeo a S/ 0.10:{' '}
            {estimateRounding() > 0 ? '+' : '−'}
            {formatSoles(Math.abs(estimateRounding()))}
          </p>
        </Show>

        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={!anySelected() || reason().trim().length < 3 || saving()}
            onClick={() => void confirm()}
          >
            {saving() ? 'Registrando…' : `Devolver ${formatSoles(estimateCents())}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
