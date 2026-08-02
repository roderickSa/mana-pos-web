import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  getTicketDetail,
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

function toLocalISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export const SalesHistoryView: Component = () => {
  // La cajera solo consulta las ventas de HOY: el rango queda fijo y sin
  // filtros de fecha. El histórico completo es del encargado.
  const todayOnly = !isManager();
  const today = toLocalISODate(new Date());
  const [from, setFrom] = createSignal(todayOnly ? today : '');
  const [to, setTo] = createSignal(todayOnly ? today : '');
  const [method, setMethod] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [voiding, setVoiding] = createSignal<TicketListItemDto | null>(null);
  const [voidReason, setVoidReason] = createSignal('');
  const [managerPin, setManagerPin] = createSignal('');
  const [voidError, setVoidError] = createSignal('');
  const [detailId, setDetailId] = createSignal<string | null>(null);

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
          style={{ 'max-width': '210px' }}
          value={from()}
          onChange={(iso) => {
            setFrom(iso);
            resetPage();
          }}
        />
        <DateField
          inputClass={forms.input}
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
                  <td class={tabla.sub}>{item.userId}</td>
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
          <Modal title={`Anular venta #${ticket().number}`} onClose={closeVoidModal}>
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
            {(ticket) => <TicketDetail ticket={ticket()} />}
          </Show>
        </Modal>
      </Show>
    </section>
  );
};

const TicketDetail: Component<{ ticket: TicketDetailDto }> = (props) => (
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

    <p class={styles.detalleSub}>
      Base {formatSoles(props.ticket.igv.baseCents)} + IGV {props.ticket.igv.ratePercent}%{' '}
      {formatSoles(props.ticket.igv.igvCents)} (incluido en el precio)
    </p>

    <div class={styles.detalleTotal}>
      <span>Total</span>
      <b>{formatSoles(props.ticket.totalCents)}</b>
    </div>
  </div>
);
