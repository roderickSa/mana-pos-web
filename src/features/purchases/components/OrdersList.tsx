import {For, Show, type Component } from 'solid-js';


import {type PurchaseOrderSummaryDto } from '@/shared/api/purchases';
import {formatSoles } from '@/shared/lib/money';
import {formatDateTime } from '@/shared/lib/dates';
import formStyles from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import {STATUS_LABEL, statusClass } from './purchase-lines';

export const OrdersList: Component<{
  orders: PurchaseOrderSummaryDto[];
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
                <td class={tabla.num}>{order.linesCount}</td>
                <td class={tabla.num}>{formatSoles(order.totalCents)}</td>
                <td>
                  <span class={statusClass(order.status)}>{STATUS_LABEL[order.status]}</span>
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
        <div class={tabla.vacio}>
          <p>Todavía no hay órdenes de compra.</p>
          <button type="button" class={tabla.nuevo} onClick={props.onNew}>
            + Crear la primera orden
          </button>
        </div>
      </Show>
    </div>
  </>
);
