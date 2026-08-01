import { For, Show, type Component } from 'solid-js';

import { formatKg, formatSoles } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import type { TicketLine } from '@/shared/types';
import {
  adjustLineQuantity,
  heldTicketsCount,
  holdCurrentTicket,
  removeLine,
  removedLineAvailable,
  resumeHeldTicket,
  selectLine,
  selectedLineIndex,
  ticketLines,
  ticketTotalCents,
  undoRemoveLine,
} from '@/features/sale/state/ticket';
import { PaymentPicker } from './PaymentPicker';
import styles from './TicketPanel.module.css';

export const TicketPanel: Component<{
  payment: string;
  onPayment: (method: string) => void;
  onCharge: () => void;
  lastSaleNumber: number | null;
  onReprintLast: () => void;
  onHelp: () => void;
  onEditWeight: (line: TicketLine) => void;
}> = (props) => (
  <aside class={styles.panel}>
    <div class={styles.voucher}>
      <header class={styles.cabecera}>
        <h2>Venta en curso</h2>
        <Show
          when={removedLineAvailable()}
          fallback={
            <span>
              {ticketLines().length === 1 ? '1 línea' : `${ticketLines().length} líneas`}
            </span>
          }
        >
          <button
            type="button"
            class={styles.deshacer}
            onClick={() => {
              const restored = undoRemoveLine();
              if (restored !== null) showNotice(`${restored.product.name} volvió al ticket`);
            }}
          >
            ↩ Deshacer
          </button>
        </Show>
      </header>

      <div class={styles.lineas}>
        <For each={ticketLines()}>
          {(line, index) => (
            <div
              class={styles.linea}
              classList={{ [styles.lineaSel]: selectedLineIndex() === index() }}
              onClick={() => selectLine(index())}
            >
              <span class={styles.info}>
                <span class={styles.nombre}>{line.product.name}</span>
                <span class={styles.detalle}>
                  {line.product.saleType === 'weight'
                    ? `${formatSoles(line.product.pricePerKgCents)} por kg`
                    : `${formatSoles(line.product.priceCents)} c/u`}
                </span>
              </span>
              <span class={styles.cantidad}>
                <Show
                  when={line.weightGrams === null}
                  fallback={
                    <button
                      type="button"
                      class={styles.peso}
                      title="Corregir el peso (vuelve a abrir la balanza)"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onEditWeight(line);
                      }}
                    >
                      ⚖ {formatKg(line.weightGrams ?? 0)}
                    </button>
                  }
                >
                  <button
                    type="button"
                    class={styles.paso}
                    aria-label={`Una menos de ${line.product.name}`}
                    disabled={line.quantity <= 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustLineQuantity(index(), -1);
                    }}
                  >
                    −
                  </button>
                  <span class={styles.cant}>{line.quantity}</span>
                  <button
                    type="button"
                    class={styles.paso}
                    aria-label={`Una más de ${line.product.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustLineQuantity(index(), 1);
                    }}
                  >
                    +
                  </button>
                </Show>
              </span>
              <span class={styles.monto}>{formatSoles(line.totalCents)}</span>
              <button
                type="button"
                class={styles.quitar}
                aria-label={`Quitar ${line.product.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const removed = removeLine(line.lineId);
                  if (removed !== null) {
                    showNotice(`Se quitó ${removed.product.name} — «Deshacer» lo devuelve`);
                  }
                }}
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
        <span class={styles.totalEtiqueta}>Total</span>
        <span class={styles.totalMonto}>{formatSoles(ticketTotalCents())}</span>
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
      <button
        type="button"
        class={`${styles.esperaBoton} ${styles.ayuda}`}
        title="Atajos de teclado (F1)"
        onClick={props.onHelp}
      >
        ⌨ F1
      </button>
    </div>

    <PaymentPicker selected={props.payment} onSelect={props.onPayment} />

    <button
      type="button"
      class={styles.cobrar}
      disabled={ticketLines().length === 0}
      onClick={props.onCharge}
    >
      Cobrar (F4)
    </button>
  </aside>
);
