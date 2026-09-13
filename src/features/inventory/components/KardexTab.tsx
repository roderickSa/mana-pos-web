import { createResource, For, Show, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import { focusOnMount } from '@/shared/lib/focus';
import { TableFooter } from '@/shared/ui/TableFooter';
import { DateField } from '@/shared/ui/DateField';
import { EmptyState } from '@/shared/ui/EmptyState';

import { movementsExportUrl, searchMovements } from '@/shared/api/inventory';
import { downloadFile } from '@/shared/api/client';
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
import { createUrlNumber, createUrlText } from '@/shared/lib/url-state';
import { subPath, withSearch } from '@/shared/lib/modal-route';

const PER_PAGE = 25;

function localISODate(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const KardexTab: Component = () => {
  const [query, setQuery] = createUrlText('q');
  const [kindRaw, setKind] = createUrlText('tipo');
  // Un tipo que no existe (URL vieja o escrita a mano) se ignora: antes se
  // mandaba tal cual al servidor, que respondía 400 y la pantalla quedaba
  // vacía sin decir por qué.
  const kind = (): string =>
    kindRaw() in MOVEMENT_KIND_LABELS ? kindRaw() : '';
  // Con la tienda en marcha el historial completo son miles de filas: se
  // abre en los últimos 7 días y las fechas abren el resto (vacías = todo).
  const [from, setFrom] = createUrlText('desde', localISODate(6));
  const [to, setTo] = createUrlText('hasta', localISODate());
  const [page, setPage] = createUrlNumber('pagina', 1);
  // El ticket abierto es una ruta hija: `/inventario/kardex/<id>` se recarga y
  // se comparte con los filtros puestos.
  const location = useLocation();
  const navigate = useNavigate();
  const KARDEX_PATH = '/inventario/kardex';
  const ticketId = (): string | undefined => subPath(KARDEX_PATH, location.pathname)[0];
  const abrirTicket = (id: string): void =>
    navigate(withSearch(`${KARDEX_PATH}/${id}`, location.search));
  const cerrarTicket = (): void => navigate(withSearch(KARDEX_PATH, location.search));
  const [ticket] = createResource(ticketId, (id) =>
    getTicketDetail(id).catch(() => {
      showNotice('No se pudo cargar el ticket.');
      return null;
    }),
  );
  const ticketDeLaRuta = () => {
    const cargado = ticket();
    return cargado !== null && cargado !== undefined && cargado.id === ticketId() ? cargado : undefined;
  };

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
          label="Desde"
          style={{ 'max-width': '210px' }}
          value={from()}
          onChange={(iso) => {
            setFrom(iso);
            resetPage();
          }}
        />
        <DateField
          label="Hasta"
          style={{ 'max-width': '210px' }}
          value={to()}
          onChange={(iso) => {
            setTo(iso);
            resetPage();
          }}
        />
        <span style={{ flex: '1' }} />
        <button
          type="button"
          class={styles.descargar}
          onClick={() =>
            void downloadFile(
              movementsExportUrl({ query: query(), kind: kind(), from: from(), to: to() }),
              'kardex-mana.csv',
            ).catch(() => showNotice('No se pudo descargar el CSV.'))
          }
        >
          ⬇ Descargar CSV
        </button>
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
                        <button type="button" onClick={() => abrirTicket(id())}>
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
          <EmptyState message="No hay movimientos con esos filtros." />
        </Show>
      </div>

      <Show when={ticketId() !== undefined}>
        <Modal
          size="md"
          title="Ticket del movimiento"
          onClose={cerrarTicket}
          footer={
            <div class={forms.acciones}>
              <button
                type="button"
                class={forms.secundario}
                onClick={cerrarTicket}
              >
                Cerrar
              </button>
            </div>
          }
        >
          {/* Con el id de la ruta: si no, al abrir otro ticket se ve el
              anterior mientras carga. */}
          <Show when={ticketDeLaRuta()} fallback={<p class={forms.nota}>Cargando…</p>}>
            {(detail) => <KardexTicketDetail ticket={detail()} />}
          </Show>
        </Modal>
      </Show>

      <TableFooter
        total={total()}
        singular="movimiento"
        plural="movimientos"
        page={page()}
        lastPage={totalPages()}
        onPage={setPage}
      />
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
