import { For, Show, type Component } from 'solid-js';

import { formatKg, formatSoles } from '@/shared/lib/money';
import { beepOk } from '@/shared/lib/sounds';
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
  ticketCustomer,
  ticketDiscountCents,
  ticketLines,
  ticketLinesTotalCents,
  ticketRoundingCents,
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
  onDiscountLine: (line: TicketLine) => void;
  onDiscountTicket: () => void;
  onLineActions: (line: TicketLine) => void;
  onCancelSale: () => void;
  onCustomer: () => void;
  // El ✕ de la fila corta la propagación (para no abrir el panel de línea),
  // así que el refoco global del buscador no lo ve: se avisa explícito.
  onRemoved: () => void;
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
              onClick={() => {
                // Tap en la fila = panel de acciones grandes (táctil primero).
                selectLine(index());
                props.onLineActions(line);
              }}
            >
              <span class={styles.info}>
                <span class={styles.nombre}>{line.product.name}</span>
                <span class={styles.detalle}>
                  {line.product.saleType === 'weight'
                    ? `${formatSoles(line.product.pricePerKgCents)} por kg`
                    : `${formatSoles(line.product.priceCents)} c/u`}
                  <Show when={line.discountCents > 0}>
                    <span class={styles.dcto}> · dcto −{formatSoles(line.discountCents)}</span>
                  </Show>
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
                class={styles.descontar}
                aria-label={`Descuento a ${line.product.name}`}
                title="Descuento a esta línea"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDiscountLine(line);
                }}
              >
                %
              </button>
              <button
                type="button"
                class={styles.quitar}
                aria-label={`Quitar ${line.product.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const removed = removeLine(line.lineId);
                  if (removed !== null) {
                    beepOk();
                    showNotice(`Se quitó ${removed.product.name} — «Deshacer» lo devuelve`);
                  }
                  props.onRemoved();
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

      {/* aria-live: el lector de pantalla anuncia el total con cada cambio. */}
      <div class={styles.total} aria-live="polite">
        <Show when={ticketDiscountCents() > 0 || ticketRoundingCents() !== 0}>
          <div class={styles.totalDesglose}>
            <span>Subtotal {formatSoles(ticketLinesTotalCents())}</span>
            <Show when={ticketDiscountCents() > 0}>
              <span>Descuento −{formatSoles(ticketDiscountCents())}</span>
            </Show>
            <Show when={ticketRoundingCents() !== 0}>
              <span>
                Redondeo {ticketRoundingCents() > 0 ? '+' : '−'}
                {formatSoles(Math.abs(ticketRoundingCents()))}
              </span>
            </Show>
          </div>
        </Show>
        <div class={styles.totalFila}>
          <span class={styles.totalEtiqueta}>Total</span>
          <span class={styles.totalMonto}>{formatSoles(ticketTotalCents())}</span>
        </div>
      </div>
    </div>

    <div class={styles.espera}>
      <button
        type="button"
        class={styles.esperaBoton}
        classList={{ [styles.clienteActivo]: ticketCustomer() !== null }}
        title="Poner la venta a nombre de un cliente (opcional)"
        onClick={props.onCustomer}
      >
        {ticketCustomer() === null ? '👤 Cliente' : `👤 ${ticketCustomer()?.name ?? ''}`}
      </button>
      <button
        type="button"
        class={styles.esperaBoton}
        disabled={ticketLines().length === 0}
        title="Descuento a toda la venta (lo autoriza el encargado)"
        onClick={props.onDiscountTicket}
      >
        % Descuento a la venta{ticketDiscountCents() > 0 ? ` −${formatSoles(ticketDiscountCents())}` : ''}
      </button>
      <button
        type="button"
        class={`${styles.esperaBoton} ${styles.cancelarVenta}`}
        disabled={ticketLines().length === 0}
        title="Cancela la venta en curso (los tickets en espera no se tocan)"
        onClick={props.onCancelSale}
      >
        ✕ Cancelar venta
      </button>
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
        title="Ver los atajos de teclado y su equivalente táctil"
        aria-label="Ayuda: atajos de teclado (F1)"
        onClick={props.onHelp}
      >
        ⌨ Ayuda (F1)
      </button>
    </div>

    <PaymentPicker selected={props.payment} onSelect={props.onPayment} />

    <button
      type="button"
      class={styles.cobrar}
      disabled={ticketLines().length === 0}
      onClick={props.onCharge}
    >
      {props.payment === 'Efectivo'
        ? 'Cobrar en efectivo (F4)'
        : props.payment === 'Fiado'
          ? 'Fiar la venta (F4)'
          : `Cobrar con ${props.payment} (F4)`}
    </button>
    {/* Un botón apagado sin motivo parece roto: se dice qué falta. */}
    <Show when={ticketLines().length === 0}>
      <p class={styles.cobrarPista}>Agrega al menos un producto para cobrar.</p>
    </Show>
  </aside>
);
