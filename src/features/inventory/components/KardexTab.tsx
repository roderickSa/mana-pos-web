import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { searchMovements } from '@/shared/api/inventory';
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
          class={styles.buscador}
          type="text"
          placeholder="Filtrar por producto…"
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
                  <td class={styles.sub}>{item.userId}</td>
                  <td class={styles.sub}>{item.reason ?? (item.ticketId !== null ? 'ticket' : '—')}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <p class={styles.vacio}>No hay movimientos con esos filtros.</p>
        </Show>
      </div>

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
