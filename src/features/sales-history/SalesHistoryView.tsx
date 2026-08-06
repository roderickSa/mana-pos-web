import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  getTicketDetail,
  refundTicketRequest,
  reprintTicket,
  salesExportUrl,
  searchSales,
  voidTicketRequest,
  type TicketDetailDto,
  type TicketListItemDto,
} from '@/shared/api/sales';
import { formatKg, formatSoles } from '@/shared/lib/money';
import { METHOD_LABELS } from '@/shared/lib/labels';
import { formatDateTime } from '@/shared/lib/dates';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { ApiError, apiErrorMessage, downloadFile } from '@/shared/api/client';
import { showNotice } from '@/shared/state/notices';
import { bumpCashRefresh } from '@/shared/state/cash-refresh';
import { currentUserName, isManager } from '@/shared/state/session';
import { verifyManagerPin } from '@/shared/api/users';
import { DateField } from '@/shared/ui/DateField';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import styles from './SalesHistoryView.module.css';

const PER_PAGE = 25;

// Motivos frecuentes de anulación: un toque en vez de teclear.
const VOID_REASONS = ['Se registró mal', 'Cliente se arrepintió', 'Precio incorrecto'];

// Motivos frecuentes de devolución.
const REFUND_REASONS = ['Producto vencido', 'Producto dañado', 'Cliente se arrepintió'];

function toLocalISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export const SalesHistoryView: Component = () => {
  // La cajera solo consulta las ventas de HOY: el rango queda fijo y sin
  // filtros de fecha. El encargado también arranca en HOY (los resúmenes
  // cuadran con la caja del día); los chips y las fechas le abren el resto,
  // y borrar ambas fechas muestra el histórico completo.
  const todayOnly = !isManager();
  const today = toLocalISODate(new Date());
  const [from, setFrom] = createSignal(today);
  const [to, setTo] = createSignal(today);
  const [method, setMethod] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [voiding, setVoiding] = createSignal<TicketListItemDto | null>(null);
  const [voidReason, setVoidReason] = createSignal('');
  const [managerPin, setManagerPin] = createSignal('');
  const [voidError, setVoidError] = createSignal('');
  const [detailId, setDetailId] = createSignal<string | null>(null);
  const [refunding, setRefunding] = createSignal<TicketDetailDto | null>(null);

  const filters = () => ({ from: from(), to: to(), method: method(), status: status() });

  const [result, { refetch }] = createResource(
    () => ({ ...filters(), page: page() }),
    (params) => searchSales(params, params.page, PER_PAGE),
  );

  const [detail] = createResource(detailId, (id) =>
    getTicketDetail(id).catch(() => {
      showNotice('No se pudo cargar el detalle de la venta.');
      return null;
    }),
  );

  const items = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const summary = () => result()?.summary;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));
  const resetPage = () => setPage(1);

  // Los contadores se concilian en una sola línea: total = cobradas + anuladas
  // (solo cuando no hay filtro de estado, si no el total ya viene filtrado).
  const voidedCount = () => {
    if (status() !== '') return null;
    const data = summary();
    if (data === undefined) return null;
    return total() - data.chargedCount;
  };

  function applyQuickRange(kind: 'hoy' | 'ayer' | 'semana' | 'mes'): void {
    const now = new Date();
    const today = toLocalISODate(now);
    if (kind === 'hoy') {
      setFrom(today);
      setTo(today);
    } else if (kind === 'ayer') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const value = toLocalISODate(yesterday);
      setFrom(value);
      setTo(value);
    } else if (kind === 'semana') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setFrom(toLocalISODate(start));
      setTo(today);
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(toLocalISODate(start));
      setTo(today);
    }
    resetPage();
  }

  const quickActive = (kind: 'hoy' | 'ayer' | 'semana' | 'mes'): boolean => {
    if (from() === '' || to() === '') return false;
    const now = new Date();
    const today = toLocalISODate(now);
    if (kind === 'hoy') return from() === today && to() === today;
    if (kind === 'ayer') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const value = toLocalISODate(yesterday);
      return from() === value && to() === value;
    }
    if (kind === 'semana') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return from() === toLocalISODate(start) && to() === today;
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return from() === toLocalISODate(start) && to() === today;
  };

  function closeVoidModal(): void {
    setVoiding(null);
    setVoidReason('');
    setManagerPin('');
    setVoidError('');
  }

  async function confirmVoid(): Promise<void> {
    const ticket = voiding();
    if (ticket === null) return;
    const reason = voidReason().trim();
    if (reason.length < 3) {
      setVoidError('Indica el motivo de la anulación.');
      return;
    }
    setVoidError('');
    try {
      // Anular es destructivo: si quien opera no es encargado, exige su PIN.
      let voidedBy = currentUserName();
      if (!isManager()) {
        const verification = await verifyManagerPin(managerPin());
        voidedBy = verification.managerName;
      }
      await voidTicketRequest(ticket.id, voidedBy, reason);
      closeVoidModal();
      beepSuccess();
      showNotice(`Venta #${ticket.number} anulada por ${voidedBy} — el stock volvió al inventario`);
      void refetch();
      bumpCashRefresh();
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.serverMessage !== null) {
        setVoidError(cause.serverMessage);
      } else {
        setVoidError(apiErrorMessage(cause, 'No se pudo anular la venta. Intenta de nuevo.'));
      }
    }
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <Show when={todayOnly}>
          <p class={styles.conteo} style={{ margin: '0' }}>
            Ventas de <b>hoy</b> — el histórico completo lo ve el encargado.
          </p>
        </Show>
        <Show when={!todayOnly}>
        <div class={styles.rapidos} role="group" aria-label="Rangos rápidos">
          <button
            type="button"
            classList={{ [styles.rapidoActivo]: quickActive('hoy') }}
            onClick={() => applyQuickRange('hoy')}
          >
            Hoy
          </button>
          <button
            type="button"
            classList={{ [styles.rapidoActivo]: quickActive('ayer') }}
            onClick={() => applyQuickRange('ayer')}
          >
            Ayer
          </button>
          <button
            type="button"
            classList={{ [styles.rapidoActivo]: quickActive('semana') }}
            onClick={() => applyQuickRange('semana')}
          >
            7 días
          </button>
          <button
            type="button"
            classList={{ [styles.rapidoActivo]: quickActive('mes') }}
            onClick={() => applyQuickRange('mes')}
          >
            Este mes
          </button>
        </div>
        <DateField
          inputClass={forms.input}
          label="Desde"
          style={{ 'max-width': '210px' }}
          value={from()}
          onChange={(iso) => {
            setFrom(iso);
            resetPage();
          }}
        />
        <DateField
          inputClass={forms.input}
          label="Hasta"
          style={{ 'max-width': '210px' }}
          value={to()}
          onChange={(iso) => {
            setTo(iso);
            resetPage();
          }}
        />
        </Show>
        <select
          class={forms.select}
          style={{ 'max-width': '170px' }}
          value={method()}
          onChange={(event) => {
            setMethod(event.currentTarget.value);
            resetPage();
          }}
        >
          <option value="">Todos los métodos</option>
          <option value="cash">Efectivo</option>
          <option value="yape">Yape</option>
          <option value="card">Tarjeta</option>
          <option value="credit">Fiado</option>
        </select>
        <select
          class={forms.select}
          style={{ 'max-width': '150px' }}
          value={status()}
          onChange={(event) => {
            setStatus(event.currentTarget.value);
            resetPage();
          }}
        >
          <option value="">Todas</option>
          <option value="charged">Cobradas</option>
          <option value="voided">Anuladas</option>
        </select>
        <span style={{ flex: '1' }} />
        <Show when={!todayOnly}>
          <button
            type="button"
            class={styles.descargar}
            onClick={() =>
              void downloadFile(salesExportUrl(filters()), 'ventas-mana.csv').catch(() =>
                showNotice('No se pudo descargar el CSV.'),
              )
            }
          >
            ⬇ Descargar CSV
          </button>
        </Show>
      </div>

      <Show when={summary()}>
        {(data) => (
          <>
            <p class={styles.conteo}>
              <b>{total()}</b> {total() === 1 ? 'venta' : 'ventas'}
              <Show when={voidedCount() !== null}>
                {' '}
                · {data().chargedCount} cobradas · {voidedCount()} anuladas
              </Show>
            </p>
            <div class={styles.resumen}>
              <div
                class={styles.tarjeta}
                title="Total del período contando solo las ventas cobradas (las anuladas no suman)"
              >
                <span>Cobrado</span>
                <b>{formatSoles(data().chargedTotalCents)}</b>
              </div>
              <div class={styles.tarjeta} title="Desglose informativo: el precio ya incluye IGV">
                <span>Base / IGV {data().igv.ratePercent}%</span>
                <b>
                  {formatSoles(data().igv.baseCents)} · {formatSoles(data().igv.igvCents)}
                </b>
              </div>
              {/* Las 4 formas de pago SIEMPRE visibles: un método en 0 también
                  es información (nadie pagó con tarjeta hoy). */}
              <For each={['cash', 'yape', 'card', 'credit']}>
                {(method) => (
                  <div class={styles.tarjeta}>
                    <span>{METHOD_LABELS[method] ?? method}</span>
                    <b>
                      {formatSoles(
                        data().byMethod.find((entry) => entry.method === method)?.amountCents ?? 0,
                      )}
                    </b>
                  </div>
                )}
              </For>
              <For each={data().soldByUser.length > 1 ? data().soldByUser : []}>
                {(entry) => (
                  <div class={styles.tarjeta}>
                    <span>Vendido por {entry.user}</span>
                    <b>
                      {entry.count} · {formatSoles(entry.totalCents)}
                    </b>
                  </div>
                )}
              </For>
              <For each={data().voidedByUser}>
                {(entry) => (
                  <div class={`${styles.tarjeta} ${styles.tarjetaAnulaciones}`}>
                    <span>Anuladas por {entry.user}</span>
                    <b>
                      {entry.count} · {formatSoles(entry.totalCents)}
                    </b>
                  </div>
                )}
              </For>
            </div>
          </>
        )}
      </Show>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Métodos</th>
              <th>Cajera</th>
              <th class={tabla.num}>Total</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={items()}>
              {(item) => (
                <tr
                  class={styles.fila}
                  classList={{ [styles.filaAnulada]: item.status === 'voided' }}
                  onClick={() => setDetailId(item.id)}
                >
                  <td class={tabla.nombre}>#{item.number}</td>
                  <td class={tabla.sub}>
                    {item.chargedAt === null ? '—' : formatDateTime(item.chargedAt)}
                  </td>
                  <td>{item.methods.map((entry) => METHOD_LABELS[entry] ?? entry).join(' + ')}</td>
                  <td class={tabla.sub}>
                    {item.userId}
                    <Show when={item.customerName}>
                      {(name) => <span class={styles.clienteFila}>👤 {name()}</span>}
                    </Show>
                  </td>
                  <td class={tabla.num}>
                    <b class={styles.monto}>{formatSoles(item.totalCents)}</b>
                  </td>
                  <td>
                    <span
                      class={styles.estado}
                      classList={{ [styles.estadoAnulada]: item.status === 'voided' }}
                    >
                      {item.status === 'charged' ? 'cobrada' : 'anulada'}
                    </span>
                  </td>
                  <td class={tabla.acciones} onClick={(event) => event.stopPropagation()}>
                    <Show when={item.status === 'charged'}>
                      <button
                        type="button"
                        onClick={() =>
                          void reprintTicket(item.id)
                            .then((result) => showNotice(result.message))
                            .catch(() => showNotice('No se pudo reimprimir el voucher.'))
                        }
                      >
                        Voucher
                      </button>
                      <button
                        type="button"
                        class={styles.anularChico}
                        title="Anular esta venta"
                        onClick={() => setVoiding(item)}
                      >
                        ⋯
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <p class={tabla.vacio}>No hay ventas con esos filtros.</p>
        </Show>
      </div>

      <div class={tabla.paginacion}>
        <button type="button" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
          ‹ Anterior
        </button>
        <span>
          Página {page()} de {totalPages()} · {total()} ventas
        </span>
        <button type="button" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
          Siguiente ›
        </button>
      </div>

      <Show when={voiding()}>
        {(ticket) => (
          <Modal
            title={`Anular venta #${ticket().number}`}
            dismissOnBackdrop={false}
            onClose={closeVoidModal}
          >
            <div class={forms.form}>
              <p class={forms.nota}>
                Se anula la venta de <b>{formatSoles(ticket().totalCents)}</b> y el stock vuelve al
                inventario. Esta acción queda registrada y no se puede deshacer.
              </p>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Motivo (obligatorio)</span>
                <div class={styles.motivos}>
                  <For each={VOID_REASONS}>
                    {(reason) => (
                      <button
                        type="button"
                        classList={{ [styles.motivoActivo]: voidReason() === reason }}
                        onClick={() => setVoidReason(reason)}
                      >
                        {reason}
                      </button>
                    )}
                  </For>
                </div>
                <input
                  class={forms.input}
                  type="text"
                  placeholder="o escribe el motivo…"
                  maxLength={200}
                  value={voidReason()}
                  onInput={(event) => setVoidReason(event.currentTarget.value)}
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
                    value={managerPin()}
                    onInput={(event) => setManagerPin(event.currentTarget.value.replace(/\D/g, ''))}
                  />
                </div>
              </Show>
              <Show when={voidError() !== ''}>
                <p class={forms.error}>{voidError()}</p>
              </Show>
              <div class={forms.acciones}>
                <button type="button" class={forms.secundario} onClick={closeVoidModal}>
                  Cancelar
                </button>
                <button
                  type="button"
                  class={styles.anular}
                  disabled={voidReason().trim().length < 3}
                  onClick={() => void confirmVoid()}
                >
                  Sí, anular venta
                </button>
              </div>
            </div>
          </Modal>
        )}
      </Show>

      <Show when={detailId() !== null}>
        <Modal size="lg" title="Detalle de la venta" onClose={() => setDetailId(null)}>
          <Show when={detail()} fallback={<p class={styles.cargando}>Cargando…</p>}>
            {(ticket) => (
              <TicketDetail
                ticket={ticket()}
                onRefund={() => {
                  setRefunding(ticket());
                  setDetailId(null);
                }}
              />
            )}
          </Show>
        </Modal>
      </Show>

      <Show when={refunding()}>
        {(ticket) => (
          <RefundModal
            ticket={ticket()}
            onClose={() => setRefunding(null)}
            onDone={(totalCents, toCredit, printerWarning) => {
              setRefunding(null);
              beepSuccess();
              const base = toCredit
                ? `Devolución de ${formatSoles(totalCents)} abonada al fiado del cliente — el stock volvió`
                : `Devolución de ${formatSoles(totalCents)} pagada de caja — el stock volvió`;
              showNotice(printerWarning === null ? base : `${base} · ${printerWarning}`);
              void refetch();
              bumpCashRefresh();
            }}
          />
        )}
      </Show>
    </section>
  );
};

// La devolución paga en efectivo (o abona al fiado) y reingresa stock: por
// línea se elige cuánto vuelve, con tope en lo que queda sin devolver.
const RefundModal: Component<{
  ticket: TicketDetailDto;
  onDone: (totalCents: number, toCredit: boolean, printerWarning: string | null) => void;
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
      let registeredBy = currentUserName();
      if (!isManager()) {
        const verification = await verifyManagerPin(pin());
        registeredBy = verification.managerName;
      }
      const refund = await refundTicketRequest(props.ticket.id, lines, trimmedReason, registeredBy);
      props.onDone(refund.totalCents, refund.refundedToCredit, refund.printerWarning ?? null);
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

const TicketDetail: Component<{ ticket: TicketDetailDto; onRefund: () => void }> = (props) => (
  <div class={styles.detalle}>
    <div class={styles.detalleCabecera}>
      <span class={styles.detalleNumero}>#{props.ticket.number}</span>
      <span
        class={styles.estado}
        classList={{ [styles.estadoAnulada]: props.ticket.status === 'voided' }}
      >
        {props.ticket.status === 'charged' ? 'cobrada' : 'anulada'}
      </span>
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
                  {refund.refundedToCredit ? 'abonado al fiado' : 'efectivo de caja'}
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
