import {For, Show, type Component } from 'solid-js';


import {type PurchaseOrderSummaryDto } from '@/shared/api/purchases';
import {formatSoles } from '@/shared/lib/money';
import {formatDateTime } from '@/shared/lib/dates';
import { TableFooter } from '@/shared/ui/TableFooter';
import formStyles from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import {STATUS_LABEL, statusTone } from './purchase-lines';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';

export const OrdersList: Component<{
  orders: PurchaseOrderSummaryDto[];
  total: number;
  page: number;
  lastPage: number;
  onPage: (page: number) => void;
  loading: boolean;
  onNew: () => void;
  onOpen: (order: PurchaseOrderSummaryDto) => void;
}> = (props) => (
  <>
    <div class={tabla.encabezado}>
      <h2>Órdenes de compra</h2>
      <button type="button" class={tabla.nuevo} onClick={props.onNew}>
        + Nueva orden
      </button>
    </div>
    <div class={tabla.tablaContenedor}>
      <table class={tabla.tabla}>
        <thead>
          <tr>
            <th class={tabla.num}>N°</th>
            <th>Fecha</th>
            <th>Proveedor</th>
            <th>Entrega</th>
            <th class={tabla.num}>Líneas</th>
            <th class={tabla.num}>Total</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <For each={props.orders}>
            {(order) => (
              <tr>
                <td class={tabla.num}>#{order.number}</td>
                <td class={tabla.sub}>{formatDateTime(order.createdAt)}</td>
                <td>{order.supplierName}</td>
                <td class={tabla.sub}>
                  {order.expectedAt === null
                    ? '—'
                    : (formatDateTime(order.expectedAt).split(',')[0] ?? '')}
                </td>
                <td class={tabla.num}>{order.linesCount}</td>
                <td class={tabla.num}>{formatSoles(order.totalCents)}</td>
                <td>
                  <Chip tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Chip>
                </td>
                <td class={tabla.acciones}>
                  <button type="button" class={formStyles.secundario} onClick={() => props.onOpen(order)}>
                    Ver
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={!props.loading && props.orders.length === 0}>
        <EmptyState
          message="Todavía no hay órdenes de compra."
          action={
            <button type="button" class={tabla.nuevo} onClick={props.onNew}>
              + Crear la primera orden
            </button>
          }
        />
      </Show>
    </div>
    <TableFooter
      total={props.total}
      singular="orden"
      plural="órdenes"
      page={props.page}
      lastPage={props.lastPage}
      onPage={props.onPage}
    />
  </>
);
