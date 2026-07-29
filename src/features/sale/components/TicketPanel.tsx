import { For, Show, type Component } from 'solid-js';

import { formatKg, formatSoles } from '@/shared/lib/money';
import {
  heldTicketsCount,
  holdCurrentTicket,
  removeLastLine,
  removeLine,
  resumeHeldTicket,
  ticketLines,
  ticketTotalCents,
} from '@/features/sale/state/ticket';
import { PaymentPicker } from './PaymentPicker';
import styles from './TicketPanel.module.css';

export const TicketPanel: Component<{
  payment: string;
  onPayment: (method: string) => void;
  onCharge: () => void;
  lastSaleNumber: number | null;
  onReprintLast: () => void;
}> = (props) => (
  <aside class={styles.panel}>
    <div class={styles.voucher}>
      <header class={styles.cabecera}>
        <h2>Venta en curso</h2>
        <Show
          when={ticketLines().length > 0}
          fallback={<span>{ticketLines().length === 1 ? '1 línea' : `${ticketLines().length} líneas`}</span>}
        >
          <button type="button" class={styles.deshacer} onClick={removeLastLine}>
            ⌫ Deshacer (F9)
          </button>
        </Show>
      </header>

      <div class={styles.lineas}>
        <For each={ticketLines()}>
          {(line) => (
            <div class={styles.linea}>
              <span class={styles.nombre}>{line.product.name}</span>
              <span class={styles.monto}>{formatSoles(line.totalCents)}</span>
              <span class={styles.detalle}>
                {line.weightGrams !== null
                  ? `${formatKg(line.weightGrams)} × ${
                      line.product.saleType === 'weight'
                        ? formatSoles(line.product.pricePerKgCents)
                        : ''
                    }/kg`
                  : `${line.quantity} × ${formatSoles(line.totalCents / line.quantity)}`}
              </span>
              <button
                type="button"
                class={styles.quitar}
                aria-label={`Quitar ${line.product.name}`}
                onClick={() => removeLine(line.lineId)}
              >
                ✕
              </button>
            </div>
          )}
        </For>
        <Show when={ticketLines().length === 0}>
          <p class={styles.vacio}>Escanea o toca un producto para empezar la venta.</p>
        </Show>
      </div>

      <div class={styles.total}>
        <span>Total</span>
        <span>{formatSoles(ticketTotalCents())}</span>
      </div>
    </div>

    <div class={styles.espera}>
      <button
        type="button"
        class={styles.esperaBoton}
        disabled={ticketLines().length === 0}
        onClick={holdCurrentTicket}
      >
        ⏸ En espera
      </button>
      <Show when={heldTicketsCount() > 0}>
        <button type="button" class={styles.esperaBoton} onClick={resumeHeldTicket}>
          ▶ Retomar ({heldTicketsCount()})
        </button>
      </Show>
      <Show when={props.lastSaleNumber !== null}>
        <button type="button" class={styles.esperaBoton} onClick={props.onReprintLast}>
          🖨 Voucher #{props.lastSaleNumber}
        </button>
      </Show>
    </div>

    <PaymentPicker selected={props.payment} onSelect={props.onPayment} />

    <button
      type="button"
      class={styles.cobrar}
      disabled={ticketLines().length === 0}
      onClick={props.onCharge}
    >
      Cobrar {formatSoles(ticketTotalCents())}
    </button>
  </aside>
);
