import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  type PurchaseOrderDto,
  type PurchaseOrderLineDto,
  type PurchaseOrderStatus,
  type PurchaseOrderSummaryDto,
  type ReceiveOrderLinePayload,
} from '@/shared/api/purchases';
import { listSuppliers } from '@/shared/api/suppliers';
import { centsToSolesInput, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepError, beepOk, beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import { currentUser } from '@/shared/state/session';
import type { ProductDto } from '@/shared/types';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { ProductPicker } from '@/shared/ui/ProductPicker';
import { DateField } from '@/shared/ui/DateField';
import { Modal } from '@/shared/ui/Modal';
import formStyles from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import styles from './PurchasesView.module.css';

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  open: 'abierta',
  partial: 'parcial',
  received: 'recibida',
  cancelled: 'cancelada',
};

function statusClass(status: PurchaseOrderStatus): string {
  const byStatus: Record<PurchaseOrderStatus, string> = {
    open: styles.estadoAbierta,
    partial: styles.estadoParcial,
    received: styles.estadoRecibida,
    cancelled: styles.estadoCancelada,
  };
  return `${styles.estado} ${byStatus[status]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Línea en edición: para productos con caja se pide en cajas; para el resto
// en unidades; para pesables en kilos. Todo se convierte al crear la orden.
interface DraftLine {
  product: ProductDto;
  quantity: string;
  cost: string;
}

function packSizeOf(product: ProductDto): number | null {
  return product.saleType === 'unit' ? product.packSize : null;
}

function quantityUnits(line: DraftLine): number {
  const packSize = packSizeOf(line.product);
  if (packSize !== null) {
    return (Number.parseInt(line.quantity, 10) || 0) * packSize;
  }
  if (line.product.saleType === 'weight') {
    const kg = Number.parseFloat(line.quantity);
    return Number.isNaN(kg) ? 0 : Math.round(kg * 1000);
  }
  return Number.parseInt(line.quantity, 10) || 0;
}

// Costo pactado por unidad o por kg; para cajas se deriva del costo por caja.
function unitCostCents(line: DraftLine): number | null {
  const cents = solesInputToCents(line.cost);
  if (cents === null || cents <= 0) return null;
  const packSize = packSizeOf(line.product);
  return packSize === null ? cents : Math.round(cents / packSize);
}

function lineTotalCents(line: DraftLine): number {
  const cost = unitCostCents(line) ?? 0;
  const units = quantityUnits(line);
  return line.product.saleType === 'weight'
    ? Math.round((cost * units) / 1000)
    : cost * units;
}

export const PurchasesView: Component = () => {
  const [mode, setMode] = createSignal<'lista' | 'nueva'>('lista');
  const [refresh, setRefresh] = createSignal(0);
  const [orders] = createResource(refresh, () => listPurchaseOrders());
  const [detail, setDetail] = createSignal<{ order: PurchaseOrderDto; supplierName: string } | null>(
    null,
  );

  async function openDetail(summary: PurchaseOrderSummaryDto): Promise<void> {
    try {
      setDetail({ order: await getPurchaseOrder(summary.id), supplierName: summary.supplierName });
    } catch {
      beepError();
    }
  }

  return (
    <div class={tabla.vista}>
      <Show
        when={mode() === 'nueva'}
        fallback={
          <OrdersList
            orders={orders() ?? []}
            loading={orders.loading}
            onNew={() => setMode('nueva')}
            onOpen={openDetail}
          />
        }
      >
        <NewOrderForm
          onDone={() => {
            setMode('lista');
            setRefresh((value) => value + 1);
          }}
          onCancel={() => setMode('lista')}
        />
      </Show>

      <Show when={detail()}>
        {(current) => (
          <OrderDetailModal
            order={current().order}
            supplierName={current().supplierName}
            onClose={() => setDetail(null)}
            onChanged={(updated) => {
              setDetail({ order: updated, supplierName: current().supplierName });
              setRefresh((value) => value + 1);
            }}
          />
        )}
      </Show>
    </div>
  );
};

const OrdersList: Component<{
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
                <td class={tabla.sub}>{formatDate(order.createdAt)}</td>
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

const NewOrderForm: Component<{ onDone: () => void; onCancel: () => void }> = (props) => {
  const [suppliers] = createResource(listSuppliers);
  const [supplierId, setSupplierId] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [lines, setLines] = createSignal<DraftLine[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  function addProduct(product: ProductDto): void {
    const packSize = packSizeOf(product);
    // Costo sugerido: última compra (por caja si se compra por caja).
    const suggested =
      product.saleType === 'weight'
        ? product.costPerKgCents
        : packSize !== null
          ? product.packCostCents
          : product.costCents;
    setLines([
      ...lines(),
      {
        product,
        quantity: '',
        cost: suggested === null || suggested <= 0 ? '' : centsToSolesInput(suggested),
      },
    ]);
  }

  function updateLine(productId: string, patch: Partial<DraftLine>): void {
    setLines(lines().map((line) => (line.product.id === productId ? { ...line, ...patch } : line)));
  }

  function removeLine(productId: string): void {
    setLines(lines().filter((line) => line.product.id !== productId));
  }

  const totalCents = () => lines().reduce((sum, line) => sum + lineTotalCents(line), 0);
  const valid = () =>
    supplierId() !== '' &&
    lines().length > 0 &&
    lines().every((line) => quantityUnits(line) > 0 && unitCostCents(line) !== null);

  function quantityLabel(line: DraftLine): string {
    if (packSizeOf(line.product) !== null) return 'Cajas';
    return line.product.saleType === 'weight' ? 'Kilos' : 'Unidades';
  }

  function costLabel(line: DraftLine): string {
    if (packSizeOf(line.product) !== null) return 'Costo/caja S/';
    return line.product.saleType === 'weight' ? 'Costo/kg S/' : 'Costo/u S/';
  }

  function lineHint(line: DraftLine): string {
    const packSize = packSizeOf(line.product);
    const units = quantityUnits(line);
    const cost = unitCostCents(line);
    if (packSize !== null && units > 0) {
      return `= ${units} unidades${cost === null ? '' : ` a ${formatSoles(cost)} c/u`}`;
    }
    return '';
  }

  async function save(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    setError('');
    try {
      await createPurchaseOrder(
        supplierId(),
        notes().trim() === '' ? null : notes().trim(),
        currentUser()?.name ?? 'encargado',
        lines().map((line) => {
          const packSize = packSizeOf(line.product);
          return {
            productId: line.product.id,
            quantity: quantityUnits(line),
            unitCostCents: unitCostCents(line) ?? 0,
            packSize,
            packCostCents: packSize === null ? null : solesInputToCents(line.cost),
          };
        }),
      );
      beepSuccess();
      showNotice('Orden de compra creada');
      props.onDone();
    } catch {
      beepError();
      setError('No se pudo crear la orden. Revisa las líneas.');
      setSaving(false);
    }
  }

  return (
    <>
      <div class={tabla.encabezado}>
        <h2>Nueva orden de compra</h2>
      </div>
      <div class={formStyles.form}>
        <div class={formStyles.fila}>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Proveedor</span>
            <select
              class={formStyles.select}
              value={supplierId()}
              onChange={(event) => {
                // Cambiar de proveedor reinicia la orden: sus productos son otros.
                setSupplierId(event.currentTarget.value);
                setLines([]);
              }}
            >
              <option value="">— Elige proveedor —</option>
              <For each={(suppliers() ?? []).filter((supplier) => supplier.active)}>
                {(supplier) => <option value={supplier.id}>{supplier.name}</option>}
              </For>
            </select>
          </div>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Notas (opcional)</span>
            <input
              class={formStyles.input}
              value={notes()}
              onInput={(event) => setNotes(event.currentTarget.value)}
              placeholder="p. ej. pedido para el fin de semana"
            />
          </div>
        </div>

        <div class={formStyles.campo}>
          <span class={formStyles.etiqueta}>
            Agregar producto (nombre, o escanea el código y Enter)
          </span>
          <ProductPicker
            placeholder={
              supplierId() === ''
                ? 'primero elige el proveedor'
                : 'busca por nombre, escanea o teclea el código y Enter'
            }
            disabled={supplierId() === ''}
            supplierId={supplierId() === '' ? null : supplierId()}
            accept={(product) => !lines().some((line) => line.product.id === product.id)}
            meta={(product) =>
              product.saleType === 'weight'
                ? `${formatSoles(product.costPerKgCents)} /kg`
                : product.packSize !== null && product.packCostCents !== null
                  ? `caja ×${product.packSize} · ${formatSoles(product.packCostCents)}`
                  : formatSoles(product.costCents)
            }
            onPick={addProduct}
          />
          <p class={formStyles.nota}>
            Solo aparecen productos asociados a este proveedor (se gestionan en Ajustes →
            Proveedores → Productos).
          </p>
        </div>

        <div class={styles.lineas}>
          <For each={lines()}>
            {(line) => (
              <div class={styles.linea}>
                <div>
                  <div class={styles.lineaNombre}>{line.product.name}</div>
                  <div class={styles.lineaSub}>{lineHint(line)}</div>
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>{quantityLabel(line)}</span>
                  <input
                    class={formStyles.input}
                    type="number"
                    min="0"
                    step={line.product.saleType === 'weight' ? '0.1' : '1'}
                    value={line.quantity}
                    onInput={(event) => updateLine(line.product.id, { quantity: event.currentTarget.value })}
                  />
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>{costLabel(line)}</span>
                  <input
                    class={formStyles.input}
                    type="number"
                    min="0"
                    step="0.10"
                    value={line.cost}
                    onInput={(event) => updateLine(line.product.id, { cost: event.currentTarget.value })}
                  />
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>Total</span>
                  <span class={styles.totalOrden} style={{ 'font-size': '15px' }}>
                    {formatSoles(lineTotalCents(line))}
                  </span>
                </div>
                <button
                  type="button"
                  class={styles.quitar}
                  aria-label={`Quitar ${line.product.name}`}
                  onClick={() => removeLine(line.product.id)}
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </div>

        <Show when={lines().length > 0}>
          <p class={styles.totalOrden}>Total de la orden: {formatSoles(totalCents())}</p>
        </Show>
        <Show when={error() !== ''}>
          <p class={formStyles.error}>{error()}</p>
        </Show>

        <div class={formStyles.acciones}>
          <button type="button" class={formStyles.secundario} onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" class={formStyles.primario} disabled={!valid() || saving()} onClick={save}>
            Crear orden
          </button>
        </div>
      </div>
    </>
  );
};

function quantityText(line: { saleType: 'unit' | 'weight'; quantity: number; packSize: number | null }): string {
  if (line.saleType === 'weight') return `${(line.quantity / 1000).toFixed(3)} kg`;
  if (line.packSize !== null && line.quantity > 0 && line.quantity % line.packSize === 0) {
    return `${line.quantity} und (${line.quantity / line.packSize} cajas)`;
  }
  return `${line.quantity} und`;
}

const OrderDetailModal: Component<{
  order: PurchaseOrderDto;
  supplierName: string;
  onClose: () => void;
  onChanged: (order: PurchaseOrderDto) => void;
}> = (props) => {
  const [error, setError] = createSignal('');
  const [receiving, setReceiving] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [confirmingCancel, setConfirmingCancel] = createSignal(false);

  const canReceive = () => props.order.status === 'open' || props.order.status === 'partial';

  // Progreso de recepción ponderado por valor (mezcla unidades y kilos).
  const receivedCentsOf = (line: PurchaseOrderLineDto) =>
    line.saleType === 'weight'
      ? Math.round((line.unitCostCents * line.quantityReceived) / 1000)
      : line.unitCostCents * line.quantityReceived;
  const progressPct = () => {
    if (props.order.totalCents <= 0) return 0;
    const received = props.order.lines.reduce((sum, line) => sum + receivedCentsOf(line), 0);
    return Math.min(100, Math.round((received / props.order.totalCents) * 100));
  };

  async function cancelOrder(): Promise<void> {
    try {
      const updated = await cancelPurchaseOrder(props.order.id);
      beepOk();
      showNotice('Orden cancelada');
      setConfirmingCancel(false);
      props.onChanged(updated);
    } catch {
      beepError();
      setConfirmingCancel(false);
      setError('No se pudo cancelar la orden.');
    }
  }

  return (
    <Modal
      size="xl"
      title={`Orden #${props.order.number} — ${props.supplierName}`}
      subtitle={
        <>
          <span class={statusClass(props.order.status)}>{STATUS_LABEL[props.order.status]}</span>
          <span>
            {formatDate(props.order.createdAt)} · creada por {props.order.createdBy}
            {props.order.notes === null ? '' : ` · ${props.order.notes}`}
          </span>
        </>
      }
      headerActions={
        <Show when={props.order.status === 'open' && !receiving()}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              class={formStyles.secundario}
              aria-haspopup="menu"
              aria-expanded={menuOpen()}
              aria-label="Más acciones"
              onClick={() => setMenuOpen(!menuOpen())}
            >
              ⋯
            </button>
            <Show when={menuOpen()}>
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: '0',
                  top: '100%',
                  'z-index': '5',
                  background: 'var(--superficie-panel)',
                  border: '1px solid var(--linea)',
                  'border-radius': '10px',
                  'box-shadow': 'var(--sombra-panel)',
                  padding: '6px',
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  class={formStyles.secundario}
                  style={{ color: 'var(--peligro)', 'white-space': 'nowrap' }}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmingCancel(true);
                  }}
                >
                  Cancelar orden…
                </button>
              </div>
            </Show>
          </div>
        </Show>
      }
      footer={
        <Show when={!receiving()}>
          <div class={formStyles.acciones}>
            <button type="button" class={formStyles.secundario} onClick={props.onClose}>
              Cerrar
            </button>
            <Show when={canReceive()}>
              <button type="button" class={formStyles.primario} onClick={() => setReceiving(true)}>
                Recibir mercadería
              </button>
            </Show>
          </div>
        </Show>
      }
      onClose={props.onClose}
    >
      <Show when={confirmingCancel()}>
        <ConfirmModal
          title={`Cancelar orden #${props.order.number}`}
          confirmLabel="Cancelar orden"
          onConfirm={() => void cancelOrder()}
          onClose={() => setConfirmingCancel(false)}
        >
          <p class={formStyles.nota}>
            La orden a {props.supplierName} por <b>{formatSoles(props.order.totalCents)}</b> quedará
            cancelada. No se ha recibido mercadería, así que el stock no cambia. Esta acción no se
            puede deshacer.
          </p>
        </ConfirmModal>
      </Show>
      <Show
        when={!receiving()}
        fallback={
          <ReceiveForm
            order={props.order}
            onCancel={() => setReceiving(false)}
            onReceived={(updated) => {
              setReceiving(false);
              props.onChanged(updated);
            }}
          />
        }
      >
      <div class={formStyles.form}>
        <Show when={props.order.status === 'open' || props.order.status === 'partial'}>
          <div
            role="progressbar"
            aria-valuenow={progressPct()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de recepción"
            style={{
              height: '8px',
              'border-radius': '999px',
              background: 'var(--superficie-app)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct()}%`,
                height: '100%',
                background: 'var(--mana-verde)',
              }}
            />
          </div>
          <p class={formStyles.nota}>{progressPct()}% del valor de la orden ya recibido</p>
        </Show>
        <div class={tabla.tablaContenedor}>
          <table class={tabla.tabla}>
            <thead>
              <tr>
                <th>Producto</th>
                <th class={tabla.num}>Pedido</th>
                <th class={tabla.num}>Recibido</th>
                <th class={tabla.num}>Pendiente</th>
                <th class={tabla.num}>Costo</th>
                <th class={tabla.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.order.lines}>
                {(line) => (
                  <tr>
                    <td>{line.description}</td>
                    <td class={tabla.num}>
                      {quantityText({
                        saleType: line.saleType,
                        quantity: line.quantityOrdered,
                        packSize: line.packSize,
                      })}
                    </td>
                    <td class={tabla.num}>
                      {quantityText({
                        saleType: line.saleType,
                        quantity: line.quantityReceived,
                        packSize: line.packSize,
                      })}
                    </td>
                    <td class={tabla.num}>
                      {quantityText({
                        saleType: line.saleType,
                        quantity: line.pendingQuantity,
                        packSize: line.packSize,
                      })}
                    </td>
                    <td class={tabla.num}>
                      {formatSoles(line.unitCostCents)}
                      {line.saleType === 'weight' ? ' /kg' : ''}
                    </td>
                    <td class={tabla.num}>{formatSoles(line.totalCents)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class={styles.totalOrden}>Total: {formatSoles(props.order.totalCents)}</p>
        <Show when={error() !== ''}>
          <p class={formStyles.error}>{error()}</p>
        </Show>
      </div>
      </Show>
    </Modal>
  );
};

// Recepción contra la orden: por línea pendiente se captura lo que llegó de
// verdad, el costo real (default: pactado) y el vencimiento del lote.
interface ReceiveDraft {
  quantity: string;
  cost: string;
  expiry: string;
}

const ReceiveForm: Component<{
  order: PurchaseOrderDto;
  onCancel: () => void;
  onReceived: (order: PurchaseOrderDto) => void;
}> = (props) => {
  const pendingLines = props.order.lines.filter((line) => line.pendingQuantity > 0);
  const initialDrafts = new Map<string, ReceiveDraft>(
    pendingLines.map((line) => [
      line.id,
      {
        quantity:
          line.saleType === 'weight'
            ? (line.pendingQuantity / 1000).toFixed(3)
            : String(line.pendingQuantity),
        cost: centsToSolesInput(line.unitCostCents),
        expiry: '',
      },
    ]),
  );
  const [drafts, setDrafts] = createSignal(initialDrafts);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  function draftOf(line: PurchaseOrderLineDto): ReceiveDraft {
    return drafts().get(line.id) ?? { quantity: '', cost: '', expiry: '' };
  }

  function updateDraft(lineId: string, patch: Partial<ReceiveDraft>): void {
    const next = new Map(drafts());
    const current = next.get(lineId);
    if (current === undefined) return;
    next.set(lineId, { ...current, ...patch });
    setDrafts(next);
  }

  function receivedUnits(line: PurchaseOrderLineDto): number {
    const draft = draftOf(line);
    if (line.saleType === 'weight') {
      const kg = Number.parseFloat(draft.quantity);
      return Number.isNaN(kg) ? 0 : Math.round(kg * 1000);
    }
    return Number.parseInt(draft.quantity, 10) || 0;
  }

  function differenceLabel(line: PurchaseOrderLineDto): string {
    const units = receivedUnits(line);
    if (units === 0 || units === line.pendingQuantity) return '';
    const diff = Math.abs(units - line.pendingQuantity);
    const amount = line.saleType === 'weight' ? `${(diff / 1000).toFixed(3)} kg` : `${diff} und`;
    return units < line.pendingQuantity ? `faltan ${amount}` : `sobran ${amount}`;
  }

  const anyToReceive = () => pendingLines.some((line) => receivedUnits(line) > 0);

  async function confirm(): Promise<void> {
    if (!anyToReceive() || saving()) return;
    setSaving(true);
    setError('');
    const payload: ReceiveOrderLinePayload[] = [];
    for (const line of pendingLines) {
      const units = receivedUnits(line);
      if (units <= 0) continue;
      const draft = draftOf(line);
      const costCents = solesInputToCents(draft.cost);
      payload.push({
        lineId: line.id,
        quantity: units,
        unitCostCents: costCents === null || costCents <= 0 ? null : costCents,
        expiryDate: draft.expiry.trim() === '' ? null : draft.expiry,
      });
    }
    try {
      const updated = await receivePurchaseOrder(
        props.order.id,
        currentUser()?.name ?? 'encargado',
        payload,
      );
      beepSuccess();
      showNotice(
        updated.status === 'received' ? 'Orden recibida completa' : 'Recepción parcial registrada',
      );
      props.onReceived(updated);
    } catch {
      beepError();
      setError('No se pudo registrar la recepción.');
      setSaving(false);
    }
  }

  return (
    <div class={formStyles.form}>
      <p class={formStyles.nota}>
        Ajusta lo que llegó de verdad. Lo que dejes en 0 queda pendiente para otra recepción. El
        costo real actualiza el costo del producto y el kardex.
      </p>
      <div class={styles.lineas}>
        <For each={pendingLines}>
          {(line) => (
            <div class={styles.linea}>
              <div>
                <div class={styles.lineaNombre}>{line.description}</div>
                <div class={styles.lineaSub}>
                  pendiente:{' '}
                  {quantityText({
                    saleType: line.saleType,
                    quantity: line.pendingQuantity,
                    packSize: line.packSize,
                  })}
                  <Show when={differenceLabel(line) !== ''}>
                    {' · '}
                    <b>{differenceLabel(line)}</b>
                  </Show>
                </div>
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>
                  {line.saleType === 'weight' ? 'Llegó (kg)' : 'Llegó (und)'}
                </span>
                <input
                  class={formStyles.input}
                  type="number"
                  min="0"
                  step={line.saleType === 'weight' ? '0.1' : '1'}
                  value={draftOf(line).quantity}
                  onInput={(event) => updateDraft(line.id, { quantity: event.currentTarget.value })}
                />
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>
                  {line.saleType === 'weight' ? 'Costo real /kg' : 'Costo real /und'}
                </span>
                <input
                  class={formStyles.input}
                  type="number"
                  min="0"
                  step="0.10"
                  value={draftOf(line).cost}
                  onInput={(event) => updateDraft(line.id, { cost: event.currentTarget.value })}
                />
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>Vence</span>
                <DateField
                  inputClass={formStyles.input}
                  value={draftOf(line).expiry}
                  onChange={(iso) => updateDraft(line.id, { expiry: iso })}
                />
              </div>
              <span />
            </div>
          )}
        </For>
      </div>
      <Show when={error() !== ''}>
        <p class={formStyles.error}>{error()}</p>
      </Show>
      <div class={formStyles.acciones}>
        <button type="button" class={formStyles.secundario} onClick={props.onCancel}>
          Volver
        </button>
        <button
          type="button"
          class={formStyles.primario}
          disabled={!anyToReceive() || saving()}
          onClick={confirm}
        >
          Confirmar recepción
        </button>
      </div>
    </div>
  );
};
