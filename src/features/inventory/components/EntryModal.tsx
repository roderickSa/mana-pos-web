import { createResource, createSignal, Show, type Component } from 'solid-js';

import { registerEntry } from '@/shared/api/inventory';
import {
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  type PurchaseOrderLineDto,
} from '@/shared/api/purchases';
import { formatKg, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepError } from '@/shared/lib/sounds';
import { DateField } from '@/shared/ui/DateField';
import { Modal } from '@/shared/ui/Modal';
import type { ProductDto } from '@/shared/types';
import { unitLabel } from '@/shared/lib/product-units';
import styles from '@/shared/ui/forms.module.css';
import { apiErrorMessage } from '@/shared/api/client';

// Umbral de aviso: con menos de este margen conviene revisar el precio.
const LOW_MARGIN_PCT = 10;

interface LinkedOrder {
  orderId: string;
  orderNumber: number;
  supplierName: string;
  line: PurchaseOrderLineDto;
}

// Cuántas órdenes pendientes se miran para ofrecer el vínculo. Una tienda no
// tiene 50 pedidos sin recibir a la vez; si los tuviera, la orden vieja se
// busca desde Compras.
const PENDING_ORDERS_TO_SCAN = 50;

export const EntryModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const unitProduct = props.product.saleType === 'unit' ? props.product : null;
  const [byBoxes, setByBoxes] = createSignal(false);
  const [quantity, setQuantity] = createSignal('');
  const [unitCost, setUnitCost] = createSignal('');
  const [boxes, setBoxes] = createSignal('');
  // La caja ya no vive en el producto sino en las condiciones de cada
  // proveedor; en una entrada directa, sin orden detrás, se teclea.
  const [unitsPerBox, setUnitsPerBox] = createSignal('');
  const [boxCost, setBoxCost] = createSignal('');
  const [expiry, setExpiry] = createSignal('');
  const [error, setError] = createSignal('');
  const [linkToOrder, setLinkToOrder] = createSignal(true);

  // Si hay una orden de compra abierta con este producto pendiente, la
  // entrada puede vincularse a ella (baja el pendiente en vez de quedar suelta).
  const [linkedOrder] = createResource<LinkedOrder | null>(async () => {
    try {
      const orders = await listPurchaseOrders(1, PENDING_ORDERS_TO_SCAN, true);
      for (const summary of orders.items) {
        const order = await getPurchaseOrder(summary.id);
        const line = order.lines.find(
          (item) => item.productId === props.product.id && item.pendingQuantity > 0,
        );
        if (line !== undefined) {
          return {
            orderId: order.id,
            orderNumber: order.number,
            supplierName: summary.supplierName,
            line,
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  });

  const costUnitLabel = () => (props.product.saleType === 'weight' ? 'por kg' : 'por unidad');

  const enteredQuantity = () =>
    byBoxes() ? totalUnits() : Number.parseInt(quantity(), 10) || 0;
  const enteredCost = () =>
    byBoxes()
      ? derivedCost()
      : unitCost().trim() === ''
        ? null
        : solesInputToCents(unitCost());

  const currentStock = () =>
    props.product.saleType === 'unit' ? props.product.stockUnits : props.product.stockGrams;
  const stockLabel = (value: number) =>
    props.product.saleType === 'unit' ? `${value} und` : formatKg(value);

  // Margen resultante con el costo capturado: si queda flaco, avisar.
  const resultingMarginPct = () => {
    const cost = enteredCost();
    if (cost === null || cost <= 0) return null;
    const price =
      props.product.saleType === 'unit' ? props.product.priceCents : props.product.pricePerKgCents;
    if (price <= 0) return null;
    return Math.round(((price - cost) / price) * 100);
  };

  const boxCount = () => Number.parseInt(boxes(), 10) || 0;
  const boxUnits = () => Number.parseInt(unitsPerBox(), 10) || 0;
  const totalUnits = () => boxCount() * boxUnits();
  // Costo unitario derivado del costo por caja.
  const derivedCost = () => {
    const cents = solesInputToCents(boxCost());
    return cents === null || cents <= 0 || boxUnits() <= 0 ? null : Math.round(cents / boxUnits());
  };

  const [saving, setSaving] = createSignal(false);
  // Fijo mientras el modal vive: reintentar tras un error no duplica la recepción.
  const receptionId = crypto.randomUUID();

  async function save(): Promise<void> {
    if (saving()) return;
    const value = enteredQuantity();
    if (value <= 0) return;
    const costCents = enteredCost();
    if (costCents === null || costCents <= 0) {
      setError(
        byBoxes()
          ? 'Falta el costo por caja: búscalo en la factura del proveedor.'
          : 'Falta el costo: búscalo en la factura del proveedor.',
      );
      return;
    }
    const order = linkedOrder();
    setSaving(true);
    try {
      if (order != null && linkToOrder()) {
        // Vinculada: es una recepción de la orden, no una entrada suelta.
        const updated = await receivePurchaseOrder(order.orderId, receptionId, [
          {
            lineId: order.line.id,
            quantity: value,
            unitCostCents: costCents,
            expiryDate: expiry().trim() === '' ? null : expiry(),
          },
        ]);
        props.onDone(
          `Recepción registrada en la orden #${order.orderNumber} (${
            updated.status === 'received' ? 'completa' : 'parcial'
          }): +${value} ${unitLabel(props.product)}`,
        );
        return;
      }
      await registerEntry(props.product.id, value, costCents, expiry().trim() === '' ? null : expiry());
      props.onDone(
        `Entrada registrada: +${value} ${unitLabel(props.product)} — costo actualizado`,
      );
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo registrar la entrada.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="md"
      title={`Entrada de mercancía — ${props.product.name}`}
      dismissOnBackdrop={false}
      onClose={props.onClose}
      footer={
        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={styles.primario}
            disabled={enteredQuantity() <= 0 || (enteredCost() ?? 0) <= 0 || saving()}
            onClick={save}
          >
            Registrar entrada
          </button>
        </div>
      }
    >
      <div class={styles.form}>
        <Show when={unitProduct !== null}>
          <label class={styles.check}>
            <input
              type="checkbox"
              checked={byBoxes()}
              onChange={(event) => setByBoxes(event.currentTarget.checked)}
            />
            Llegó en cajas/paquetes
          </label>
        </Show>

        <Show
          when={byBoxes()}
          fallback={
            <div class={styles.fila}>
              <div class={styles.campo}>
                <span class={styles.etiqueta}>Cantidad que llegó ({unitLabel(props.product)})</span>
                <input
                  class={styles.input}
                  type="number"
                  min="1"
                  value={quantity()}
                  onInput={(event) => setQuantity(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && save()}
                  autofocus
                />
              </div>
              <div class={styles.campo}>
                <span class={styles.etiqueta}>Costo S/ {costUnitLabel()}</span>
                <input
                  class={styles.input}
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="lo que pagaste"
                  value={unitCost()}
                  onInput={(event) => setUnitCost(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && save()}
                />
              </div>
            </div>
          }
        >
          <div class={styles.fila}>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Cajas que llegaron</span>
              <input
                class={styles.input}
                type="number"
                min="1"
                step="1"
                value={boxes()}
                onInput={(event) => setBoxes(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Enter' && save()}
                autofocus
              />
            </div>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Unidades por caja</span>
              <input
                class={styles.input}
                type="number"
                min="1"
                step="1"
                value={unitsPerBox()}
                onInput={(event) => setUnitsPerBox(event.currentTarget.value)}
              />
            </div>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Costo por caja S/</span>
              <input
                class={styles.input}
                type="number"
                step="0.10"
                min="0"
                placeholder="lo que pagaste"
                value={boxCost()}
                onInput={(event) => setBoxCost(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Enter' && save()}
              />
            </div>
          </div>
          <Show when={totalUnits() > 0}>
            <p class={styles.nota}>
              = {totalUnits()} unidades
              {derivedCost() === null ? '' : ` a ${formatSoles(derivedCost() ?? 0)} c/u`}
            </p>
          </Show>
        </Show>

        <Show when={enteredQuantity() > 0}>
          <p class={styles.nota}>
            Stock: {stockLabel(currentStock())} → <b>{stockLabel(currentStock() + enteredQuantity())}</b>
          </p>
        </Show>
        <Show when={resultingMarginPct() !== null && (resultingMarginPct() ?? 0) < LOW_MARGIN_PCT}>
          <p class={styles.error}>
            Con este costo el margen queda en {resultingMarginPct()}% — considera actualizar el
            precio de venta.
          </p>
        </Show>
        <Show when={linkedOrder()}>
          {(order) => (
            <label class={styles.check}>
              <input
                type="checkbox"
                checked={linkToOrder()}
                onChange={(event) => setLinkToOrder(event.currentTarget.checked)}
              />
              Vincular a la orden #{order().orderNumber} de {order().supplierName} — baja su
              pendiente en vez de crear una entrada suelta
            </label>
          )}
        </Show>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>Fecha de vencimiento (opcional)</span>
          <DateField inputClass={styles.input} value={expiry()} onChange={setExpiry} />
        </div>
        <p class={styles.nota}>
          El costo es obligatorio: con él se calcula el margen y se valoriza el kardex. La fecha
          de vencimiento alimenta la pestaña «Por vencer».
        </p>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};
