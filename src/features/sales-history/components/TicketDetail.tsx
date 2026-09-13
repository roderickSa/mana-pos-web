import {For, Show, type Component } from 'solid-js';

import {type TicketDetailDto } from '@/shared/api/sales';
import {formatKg, formatSoles } from '@/shared/lib/money';
import {METHOD_LABELS } from '@/shared/lib/labels';
import {formatDateTime } from '@/shared/lib/dates';
import { Chip } from '@/shared/ui/Chip';
import forms from '@/shared/ui/forms.module.css';
import styles from '../SalesHistoryView.module.css';
import {refundChannelLabel } from './sales-history.helpers';

export const TicketDetail: Component<{ ticket: TicketDetailDto; onRefund: () => void }> = (props) => (
  <div class={styles.detalle}>
    <div class={styles.detalleCabecera}>
      <span class={styles.detalleNumero}>#{props.ticket.number}</span>
      <Chip tone={props.ticket.status === 'charged' ? 'exito' : 'peligro'}>
        {props.ticket.status === 'charged' ? 'cobrada' : 'anulada'}
      </Chip>
      <span class={styles.detalleMeta}>
        {props.ticket.chargedAt === null ? '' : formatDateTime(props.ticket.chargedAt)} ·{' '}
        {props.ticket.userId}
        {props.ticket.customerName !== null ? ` · 👤 ${props.ticket.customerName}` : ''}
      </span>
    </div>

    <Show when={props.ticket.status === 'voided'}>
      <p class={styles.detalleAnulada}>
        Anulada {props.ticket.voidedAt === null ? '' : formatDateTime(props.ticket.voidedAt)} por{' '}
        <b>{props.ticket.voidedBy ?? '—'}</b>
        <Show when={props.ticket.voidReason}>
          {(reason) => (
            <>
              {' '}
              — motivo: <b>{reason()}</b>
            </>
          )}
        </Show>
      </p>
    </Show>

    <table class={styles.detalleTabla}>
      <tbody>
        <For each={props.ticket.lines}>
          {(line) => (
            <tr>
              <td>
                {line.description}
                <span class={styles.detalleSub}>
                  {line.grams !== null
                    ? ` ${formatKg(line.grams)} × ${formatSoles(line.unitPriceCents)}/kg`
                    : ` ${line.quantity} × ${formatSoles(line.unitPriceCents)}`}
                  {line.discountCents > 0 ? ` · dcto −${formatSoles(line.discountCents)}` : ''}
                </span>
              </td>
              <td class={styles.detalleMonto}>{formatSoles(line.totalCents)}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>

    <div class={styles.detallePagos}>
      <For each={props.ticket.payments}>
        {(payment) => (
          <span>
            {METHOD_LABELS[payment.method] ?? payment.method}:{' '}
            <b>{formatSoles(payment.amountCents)}</b>
          </span>
        )}
      </For>
    </div>

    {/* Resumen tipo voucher: cada ajuste en su fila y solo cuando aplica —
        así el descuento y el redondeo se leen de un vistazo. */}
    <Show
      when={
        props.ticket.discountCents > 0 ||
        props.ticket.lineDiscountsCents > 0 ||
        props.ticket.roundingCents !== 0
      }
    >
      <div class={styles.detalleResumen}>
        <div>
          <span>Suma de productos</span>
          <b>{formatSoles(props.ticket.linesTotalCents)}</b>
        </div>
        <Show when={props.ticket.lineDiscountsCents > 0}>
          <div class={styles.filaAjuste}>
            <span>Descuentos por línea</span>
            <b>−{formatSoles(props.ticket.lineDiscountsCents)}</b>
          </div>
        </Show>
        <Show when={props.ticket.discountCents > 0}>
          <div class={styles.filaAjuste}>
            <span>
              Descuento a la venta
              {props.ticket.discountAuthorizedBy !== null
                ? ` (autorizó ${props.ticket.discountAuthorizedBy})`
                : ''}
            </span>
            <b>−{formatSoles(props.ticket.discountCents)}</b>
          </div>
        </Show>
        <Show when={props.ticket.roundingCents !== 0}>
          <div class={styles.filaAjuste}>
            <span>Redondeo a S/ 0.10</span>
            <b>
              {props.ticket.roundingCents > 0 ? '+' : '−'}
              {formatSoles(Math.abs(props.ticket.roundingCents))}
            </b>
          </div>
        </Show>
      </div>
    </Show>

    <div class={styles.detalleTotal}>
      <span>Total cobrado</span>
      <b>{formatSoles(props.ticket.totalCents)}</b>
    </div>

    <p class={styles.detalleSub}>
      Base {formatSoles(props.ticket.igv.baseCents)} + IGV {props.ticket.igv.ratePercent}%{' '}
      {formatSoles(props.ticket.igv.igvCents)} (incluido en el precio)
    </p>

    <Show when={props.ticket.refunds.length > 0}>
      <div class={styles.detalleDevoluciones}>
        <p class={styles.devolucionTitulo}>Devoluciones</p>
        <For each={props.ticket.refunds}>
          {(refund) => {
            const exact = refund.lines.reduce((sum, line) => sum + line.amountCents, 0);
            return (
              <div class={styles.devolucionCard}>
                <div class={styles.devolucionCabecera}>
                  <span>
                    {formatDateTime(refund.createdAt)} · {refund.reason} · registró{' '}
                    {refund.registeredBy}
                  </span>
                  <b>−{formatSoles(refund.totalCents)}</b>
                </div>
                <p class={styles.detalleSub}>
                  {refund.lines
                    .map((line) => {
                      // Pesables: la cantidad devuelta va en gramos → se muestra en kg.
                      const original = props.ticket.lines.find((tl) => tl.id === line.ticketLineId);
                      const isWeight = original !== undefined && original.grams !== null;
                      return `${line.description} ${isWeight ? formatKg(line.quantity) : `×${line.quantity}`}`;
                    })
                    .join(' · ')}
                  {' — '}
                  {refundChannelLabel(refund)}
                  {exact !== refund.totalCents
                    ? ` · exacto ${formatSoles(exact)}, redondeado a S/ 0.10`
                    : ''}
                </p>
              </div>
            );
          }}
        </For>
        <div class={styles.devolucionNeto}>
          <span>Queda cobrado (tras devoluciones)</span>
          <b>{formatSoles(props.ticket.totalCents - props.ticket.refundedCents)}</b>
        </div>
      </div>
    </Show>

    <Show when={props.ticket.status === 'charged' && props.ticket.refundedCents < props.ticket.totalCents}>
      <div class={forms.acciones}>
        <button type="button" class={forms.secundario} onClick={props.onRefund}>
          Devolver productos…
        </button>
      </div>
    </Show>
  </div>
);
