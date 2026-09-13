import {createSignal, For, Show, type Component } from 'solid-js';
import { useNavigate } from '@solidjs/router';


import {
  cancelPurchaseOrder,
  closePurchaseOrderEarly,
  confirmPurchaseOrder,
  type PurchaseOrderDto,
  type PurchaseOrderLineDto,
} from '@/shared/api/purchases';
import { apiErrorMessage } from '@/shared/api/client';
import {formatSoles } from '@/shared/lib/money';
import {beepError, beepOk } from '@/shared/lib/sounds';
import {formatDateTime } from '@/shared/lib/dates';
import {showNotice } from '@/shared/state/notices';
import {ConfirmModal } from '@/shared/ui/ConfirmModal';
import { Modal } from '@/shared/ui/Modal';
import formStyles from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import {STATUS_HINT, STATUS_LABEL, statusTone, quantityText } from './purchase-lines';
import { Chip } from '@/shared/ui/Chip';
import { RowMenu } from '@/shared/ui/RowMenu';
import { TableFooter } from '@/shared/ui/TableFooter';
import { ReceiveForm } from './ReceiveForm';

export const OrderDetailModal: Component<{
  order: PurchaseOrderDto;
  supplierName: string;
  onClose: () => void;
  onChanged: (order: PurchaseOrderDto) => void;
}> = (props) => {
  const navigate = useNavigate();
  const [error, setError] = createSignal('');
  const [receiving, setReceiving] = createSignal(false);
  const [confirmingCancel, setConfirmingCancel] = createSignal(false);
  const [closingEarly, setClosingEarly] = createSignal(false);
  const [closeReason, setCloseReason] = createSignal('');

  const canReceive = () => props.order.status === 'open' || props.order.status === 'partial';
  const pendiente = () => props.order.pendingCents;

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

  async function confirmDraft(): Promise<void> {
    try {
      const updated = await confirmPurchaseOrder(props.order.id);
      beepOk();
      showNotice(`Orden #${updated.number} confirmada`);
      props.onChanged(updated);
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo confirmar la orden.'));
    }
  }

  // La parcial que el proveedor nunca va a completar: se cierra con motivo en
  // vez de quedar colgada como pendiente para siempre.
  async function closeEarly(): Promise<void> {
    if (closeReason().trim() === '') return;
    try {
      const updated = await closePurchaseOrderEarly(props.order.id, closeReason().trim());
      beepOk();
      showNotice(`Orden #${updated.number} cerrada`);
      setClosingEarly(false);
      setCloseReason('');
      props.onChanged(updated);
    } catch (cause) {
      beepError();
      setClosingEarly(false);
      setError(apiErrorMessage(cause, 'No se pudo cerrar la orden.'));
    }
  }

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
      dismissOnBackdrop={false}
      title={`Orden #${props.order.number} — ${props.supplierName}`}
      subtitle={
        <>
          <Chip tone={statusTone(props.order.status)} title={STATUS_HINT[props.order.status]}>
            {STATUS_LABEL[props.order.status]}
          </Chip>
          <span>
            {formatDateTime(props.order.createdAt)} · creada por {props.order.createdBy}
            {props.order.expectedAt === null
              ? ''
              : ` · entrega ${formatDateTime(props.order.expectedAt).split(',')[0] ?? ''}`}
            {props.order.notes === null ? '' : ` · ${props.order.notes}`}
            {props.order.closedReason === null ? '' : ` · motivo: ${props.order.closedReason}`}
          </span>
        </>
      }
      headerActions={
        <Show when={props.order.status === 'open' && !receiving()}>
          <RowMenu
            items={[{ key: 'cancel', label: 'Cancelar orden…', tone: 'peligro' }]}
            onSelect={() => setConfirmingCancel(true)}
          />
        </Show>
      }
      footer={
        <Show when={!receiving()}>
          <div class={formStyles.acciones}>
            <button type="button" class={formStyles.secundario} onClick={props.onClose}>
              Cerrar
            </button>
            <Show when={props.order.status === 'partial'}>
              <button
                type="button"
                class={formStyles.secundario}
                title="El proveedor no va a traer el resto"
                onClick={() => setClosingEarly(true)}
              >
                Cerrar incompleta
              </button>
            </Show>
            <Show when={props.order.status === 'draft'}>
              {/* Un borrador se abre para terminarlo, no solo para confirmarlo
                  a ciegas: es el mismo formulario donde se armó. */}
              <button
                type="button"
                class={formStyles.secundario}
                onClick={() => navigate(`/compras/ordenes/${props.order.id}/editar`)}
              >
                Seguir editando
              </button>
              <button type="button" class={formStyles.primario} onClick={() => void confirmDraft()}>
                Confirmar orden
              </button>
            </Show>
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
      <Show when={closingEarly()}>
        <ConfirmModal
          title={`Cerrar la orden #${props.order.number} incompleta`}
          confirmLabel="Cerrar orden"
          onConfirm={() => void closeEarly()}
          onClose={() => setClosingEarly(false)}
        >
          <p class={formStyles.nota}>
            Quedan {formatSoles(pendiente())} sin traer. La orden deja de figurar como pendiente y
            el stock no cambia.
          </p>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Motivo</span>
            <input
              id="cerrar-motivo"
              class={formStyles.input}
              placeholder="p. ej. no tenía más stock"
              value={closeReason()}
              onInput={(event) => setCloseReason(event.currentTarget.value)}
            />
          </div>
        </ConfirmModal>
      </Show>

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
        <TableFooter
          total={props.order.lines.length}
          singular="producto pedido"
          plural="productos pedidos"
          detail={
            <>
              Total: {formatSoles(props.order.totalCents)}
              <Show when={pendiente() > 0}>
                <span class={formStyles.nota}> · falta traer {formatSoles(pendiente())}</span>
              </Show>
            </>
          }
        />

        {/* La historia tanda a tanda: complementa la barra de progreso, que
            solo muestra el acumulado. */}
        <Show when={props.order.receptions.length > 0}>
          <div>
            <h3 style={{ margin: '4px 0 8px', 'font-size': '1rem' }}>
              Recepciones ({props.order.receptions.length})
            </h3>
            <For each={props.order.receptions}>
              {(reception, index) => {
                const lineOf = (productId: string) =>
                  props.order.lines.find((line) => line.productId === productId);
                return (
                  <div
                    style={{
                      'border-top': '1px dashed var(--linea)',
                      padding: '8px 0',
                    }}
                  >
                    <p class={formStyles.nota} style={{ margin: '0 0 4px' }}>
                      Tanda {index() + 1} · {formatDateTime(reception.receivedAt)} · recibió{' '}
                      {reception.receivedBy}
                      {reception.documentNumber === null ? '' : ` · ${reception.documentNumber}`}
                      {reception.paymentTerms === null ? '' : ` · ${reception.paymentTerms}`}
                    </p>
                    <For each={reception.lines}>
                      {(line) => {
                        const orderLine = lineOf(line.productId);
                        return (
                          <p style={{ margin: '2px 0', 'font-size': '0.9rem' }}>
                            {orderLine?.description ?? line.productId} —{' '}
                            {quantityText({
                              saleType: orderLine?.saleType ?? 'unit',
                              quantity: line.quantity,
                              packSize: orderLine?.packSize ?? null,
                            })}{' '}
                            a {formatSoles(line.unitCostCents)}
                            {orderLine?.saleType === 'weight' ? ' /kg' : ' c/u'}
                            {line.expiryDate === null
                              ? ''
                              : ` · vence ${formatDateTime(line.expiryDate).split(',')[0] ?? ''}`}
                          </p>
                        );
                      }}
                    </For>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

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
