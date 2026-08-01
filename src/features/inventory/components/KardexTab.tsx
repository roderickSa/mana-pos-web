import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { focusOnMount } from '@/shared/lib/focus';
import { DateField } from '@/shared/ui/DateField';

import { searchMovements } from '@/shared/api/inventory';
import { getTicketDetail, type TicketDetailDto } from '@/shared/api/sales';
import { formatSoles } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import { METHOD_LABELS } from '@/shared/lib/labels';
import { Modal } from '@/shared/ui/Modal';

// Los registros viejos traen el usuario con mayúsculas dispares y el seed
// como "seed-demo": se muestran normalizados.
function displayUser(userId: string): string {
  if (userId === 'seed-demo' || userId === 'import-excel') return 'carga inicial';
  return userId.charAt(0).toUpperCase() + userId.slice(1).toLowerCase();
}
import { MOVEMENT_KIND_LABELS } from '@/shared/lib/labels';
import { formatDateTime } from '@/shared/lib/dates';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

const PER_PAGE = 25;

export const KardexTab: Component = () => {
  const [query, setQuery] = createSignal('');
  const [kind, setKind] = createSignal('');
  const [from, setFrom] = createSignal('');
  const [to, setTo] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [ticketId, setTicketId] = createSignal<string | null>(null);
  const [ticket] = createResource(ticketId, (id) =>
    getTicketDetail(id).catch(() => {
      showNotice('No se pudo cargar el ticket.');
      return null;
    }),
  );

  const [result] = createResource(
    () => ({ query: query(), kind: kind(), from: from(), to: to(), page: page(), perPage: PER_PAGE }),
    (filters) => searchMovements(filters),
  );

  const items = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  const resetPage = () => setPage(1);

  return (
    <section class={styles.vista}>
      <div class={styles.encabezado}>
        <input
          ref={focusOnMount}
          class={styles.buscador}
          type="text"
          placeholder="Filtrar por producto o escanea su código de barras…"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            resetPage();
          }}
        />
        <select
          class={forms.select}
          style={{ 'max-width': '190px' }}
          value={kind()}
          onChange={(event) => {
            setKind(event.currentTarget.value);
            resetPage();
          }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(MOVEMENT_KIND_LABELS).map(([value, label]) => (
            <option value={value}>{label}</option>
          ))}
        </select>
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
      </div>

      <div class={styles.tablaContenedor}>
        <table class={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th class={styles.num}>Cantidad</th>
              <th>Usuario</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            <For each={items()}>
              {(item) => (
                <tr>
                  <td class={styles.sub}>
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td class={styles.nombre}>{item.productName}</td>
                  <td>{MOVEMENT_KIND_LABELS[item.kind] ?? item.kind}</td>
                  <td class={styles.num}>
                    <span
                      class={styles.margen}
                      classList={{ [styles.margenNegativo]: item.quantity < 0 }}
                    >
                      {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                    </span>
                  </td>
                  <td class={styles.sub}>{displayUser(item.userId)}</td>
                  <td class={styles.sub}>
                    <Show when={item.ticketId} fallback={item.reason ?? '—'}>
                      {(id) => (
                        <button type="button" onClick={() => setTicketId(id())}>
                          Ver ticket
                        </button>
                      )}
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <p class={styles.vacio}>No hay movimientos con esos filtros.</p>
        </Show>
      </div>

      <Show when={ticketId() !== null}>
        <Modal size="md" title="Ticket del movimiento" onClose={() => setTicketId(null)}>
          <Show when={ticket()} fallback={<p class={forms.nota}>Cargando…</p>}>
            {(detail) => <KardexTicketDetail ticket={detail()} />}
          </Show>
        </Modal>
      </Show>

      <div class={styles.paginacion}>
        <button type="button" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
          ‹ Anterior
        </button>
        <span>
          Página {page()} de {totalPages()} · {total()} movimientos
        </span>
        <button type="button" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
          Siguiente ›
        </button>
      </div>
    </section>
  );
};

const KardexTicketDetail: Component<{ ticket: TicketDetailDto }> = (props) => (
  <div class={forms.form}>
    <p class={forms.nota}>
      Venta #{props.ticket.number} · {props.ticket.status === 'charged' ? 'cobrada' : 'anulada'} ·{' '}
      {formatDateTime(props.ticket.chargedAt ?? props.ticket.createdAt)} · {displayUser(props.ticket.userId)}
    </p>
    <For each={props.ticket.lines}>
      {(line) => (
        <p class={forms.nota} style={{ 'border-bottom': '1px dashed var(--linea)', padding: '4px 0' }}>
          {line.description} — {formatSoles(line.totalCents)}
        </p>
      )}
    </For>
    <p class={forms.nota}>
      Pagos: {props.ticket.payments.map((payment) => METHOD_LABELS[payment.method] ?? payment.method).join(', ')}
      {' · '}Total: <b>{formatSoles(props.ticket.totalCents)}</b>
    </p>
  </div>
);
