import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  reprintTicket,
  salesExportUrl,
  searchSales,
  voidTicketRequest,
  type TicketListItemDto,
} from '@/shared/api/sales';
import { formatSoles } from '@/shared/lib/money';
import { METHOD_LABELS } from '@/shared/lib/labels';
import { formatDateTime } from '@/shared/lib/dates';
import { ApiError } from '@/shared/api/client';
import { showNotice } from '@/shared/state/notices';
import { bumpCashRefresh } from '@/shared/state/cash-refresh';
import { currentUserName, isManager } from '@/shared/state/session';
import { verifyManagerPin } from '@/shared/api/users';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import styles from './SalesHistoryView.module.css';

const PER_PAGE = 25;

export const SalesHistoryView: Component = () => {
  const [from, setFrom] = createSignal('');
  const [to, setTo] = createSignal('');
  const [method, setMethod] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [voiding, setVoiding] = createSignal<TicketListItemDto | null>(null);
  const [managerPin, setManagerPin] = createSignal('');
  const [voidError, setVoidError] = createSignal('');

  const filters = () => ({ from: from(), to: to(), method: method(), status: status() });

  const [result, { refetch }] = createResource(
    () => ({ ...filters(), page: page() }),
    (params) => searchSales(params, params.page, PER_PAGE),
  );

  const items = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const summary = () => result()?.summary;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));
  const resetPage = () => setPage(1);

  async function confirmVoid(): Promise<void> {
    const ticket = voiding();
    if (ticket === null) return;
    setVoidError('');
    try {
      // Anular es destructivo: si quien opera no es encargado, exige su PIN.
      let voidedBy = currentUserName();
      if (!isManager()) {
        const verification = await verifyManagerPin(managerPin());
        voidedBy = verification.managerName;
      }
      await voidTicketRequest(ticket.id, voidedBy);
      setVoiding(null);
      setManagerPin('');
      showNotice(`Venta #${ticket.number} anulada por ${voidedBy} — el stock volvió al inventario`);
      void refetch();
      bumpCashRefresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.serverMessage !== null) {
        setVoidError(cause.serverMessage);
      } else {
        setVoidError('No se pudo anular la venta. Intenta de nuevo.');
      }
    }
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <input
          class={forms.input}
          style={{ 'max-width': '170px' }}
          type="date"
          value={from()}
          onInput={(event) => {
            setFrom(event.currentTarget.value);
            resetPage();
          }}
        />
        <input
          class={forms.input}
          style={{ 'max-width': '170px' }}
          type="date"
          value={to()}
          onInput={(event) => {
            setTo(event.currentTarget.value);
            resetPage();
          }}
        />
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
        <a class={styles.descargar} href={salesExportUrl(filters())} download="ventas-mana.csv">
          ⬇ Descargar CSV
        </a>
      </div>

      <Show when={summary()}>
        {(data) => (
          <div class={styles.resumen}>
            <div class={styles.tarjeta}>
              <span>Ventas cobradas</span>
              <b>{data().chargedCount}</b>
            </div>
            <div class={styles.tarjeta}>
              <span>Total del período</span>
              <b>{formatSoles(data().chargedTotalCents)}</b>
            </div>
            <For each={data().byMethod}>
              {(entry) => (
                <div class={styles.tarjeta}>
                  <span>{METHOD_LABELS[entry.method] ?? entry.method}</span>
                  <b>{formatSoles(entry.amountCents)}</b>
                </div>
              )}
            </For>
          </div>
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
                <tr classList={{ [tabla.inactivo]: item.status === 'voided' }}>
                  <td class={tabla.nombre}>#{item.number}</td>
                  <td class={tabla.sub}>
                    {item.chargedAt === null ? '—' : formatDateTime(item.chargedAt)}
                  </td>
                  <td>{item.methods.map((entry) => METHOD_LABELS[entry] ?? entry).join(' + ')}</td>
                  <td class={tabla.sub}>{item.userId}</td>
                  <td class={tabla.num}>
                    <b>{formatSoles(item.totalCents)}</b>
                  </td>
                  <td>
                    <span
                      class={styles.estado}
                      classList={{ [styles.estadoAnulada]: item.status === 'voided' }}
                    >
                      {item.status === 'charged' ? 'cobrada' : 'anulada'}
                    </span>
                  </td>
                  <td class={tabla.acciones}>
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
                      <button type="button" onClick={() => setVoiding(item)}>
                        Anular
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
            onClose={() => {
              setVoiding(null);
              setManagerPin('');
              setVoidError('');
            }}
          >
            <div class={forms.form}>
              <p class={forms.nota}>
                Se anula la venta de <b>{formatSoles(ticket().totalCents)}</b> y el stock vuelve al
                inventario. Esta acción queda registrada y no se puede deshacer.
              </p>
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
                    autofocus
                  />
                </div>
              </Show>
              <Show when={voidError() !== ''}>
                <p class={forms.error}>{voidError()}</p>
              </Show>
              <div class={forms.acciones}>
                <button type="button" class={forms.secundario} onClick={() => setVoiding(null)}>
                  Cancelar
                </button>
                <button type="button" class={styles.anular} onClick={() => void confirmVoid()}>
                  Sí, anular venta
                </button>
              </div>
            </div>
          </Modal>
        )}
      </Show>
    </section>
  );
};
