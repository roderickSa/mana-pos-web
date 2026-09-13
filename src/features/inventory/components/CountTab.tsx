import { createEffect, createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import { apiErrorMessage } from '@/shared/api/client';
import {
  closeCountSession,
  discardCountSession,
  getOpenCountSession,
  listClosedCountSessions,
  recordCount,
  removeCount,
  startCountSession,
  type ClosedCountSessionDto,
  type OpenCountSessionDto,
} from '@/shared/api/inventory';
import { searchProductsPage } from '@/shared/api/products';
import { allCategories, categoryName } from '@/shared/state/categories';
import { formatDateTime } from '@/shared/lib/dates';
import { formatKg, formatSoles } from '@/shared/lib/money';
import { beepError, beepOk, beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { readStored, removeStored, writeStored } from '@/shared/lib/storage';
import { decodeCountDraft, isEmptyCountDraft, type CountDraft } from './count-draft';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { StatTile, StatTiles } from '@/shared/ui/StatTile';
import { TableFooter } from '@/shared/ui/TableFooter';
import forms from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import { createUrlNumber, createUrlText } from '@/shared/lib/url-state';
import styles from './CountTab.module.css';

const PER_PAGE = 50;
// Los conteos cerrados se acumulan uno por semana: también van de a página.
const HISTORY_PER_PAGE = 20;

function stockOf(product: ProductDto): number {
  return product.saleType === 'unit' ? product.stockUnits : product.stockGrams;
}

function quantityLabel(product: ProductDto, quantity: number): string {
  return product.saleType === 'unit' ? `${quantity} und` : formatKg(quantity);
}

// Lo que se teclea: unidades enteras, o kilos con decimales para pesables.
function toQuantity(product: ProductDto, typed: string): number | null {
  if (typed.trim() === '') return null;
  if (product.saleType === 'weight') {
    const kg = Number.parseFloat(typed);
    return Number.isNaN(kg) || kg < 0 ? null : Math.round(kg * 1000);
  }
  const units = Number.parseInt(typed, 10);
  return Number.isNaN(units) || units < 0 ? null : units;
}

const StartPanel: Component<{ onStarted: () => void }> = (props) => {
  const [category, setCategory] = createSignal('');
  const [starting, setStarting] = createSignal(false);
  const [error, setError] = createSignal('');

  async function start(): Promise<void> {
    if (starting()) return;
    setStarting(true);
    setError('');
    try {
      await startCountSession(category() === '' ? null : category());
      beepOk();
      props.onStarted();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo empezar el conteo.'));
      setStarting(false);
    }
  }

  // Arrancar un conteo es una fila de encabezado como la de cualquier otra
  // vista, no un formulario alto: lo que importa de la pantalla es el historial
  // que va abajo.
  return (
    <>
      <div class={tabla.encabezado}>
        <p class={tabla.sub} style={{ flex: '1', 'min-width': '280px', margin: '0' }}>
          Un conteo por vez. Anota lo que cuentas producto por producto y el stock recién se
          ajusta al cerrar, con un resumen de cuánto cuadró y cuánta plata hay de diferencia.
        </p>
        <select
          id="conteo-categoria"
          class={forms.select}
          style={{ 'max-width': '220px' }}
          aria-label="Categoría a contar"
          value={category()}
          onChange={(event) => setCategory(event.currentTarget.value)}
        >
          <option value="">Toda la tienda</option>
          <For each={allCategories()}>
            {(item) => <option value={item.slug}>{item.name}</option>}
          </For>
        </select>
        <button type="button" class={tabla.nuevo} disabled={starting()} onClick={start}>
          Empezar conteo
        </button>
      </div>
      <Show when={error() !== ''}>
        <p class={forms.error}>{error()}</p>
      </Show>
    </>
  );
};

const ClosedSummary: Component<{
  session: ClosedCountSessionDto;
  names: Map<string, string>;
  onClose: () => void;
}> = (props) => (
  <Modal
    size="lg"
    title={`Conteo cerrado — ${props.session.category ?? 'toda la tienda'}`}
    subtitle={`${formatDateTime(props.session.closedAt)} · cerró ${props.session.closedBy}`}
    onClose={props.onClose}
    footer={
      <div class={forms.acciones}>
        <button type="button" class={forms.primario} onClick={props.onClose}>
          Entendido
        </button>
      </div>
    }
  >
    <StatTiles>
      <StatTile label="Productos contados" value={props.session.productsCounted} />
      <StatTile label="Cuadraron" value={props.session.productsMatched} tone="destacado" />
      <StatTile
        label="No cuadraron"
        value={props.session.productsOff}
        tone={props.session.productsOff > 0 ? 'malo' : 'normal'}
      />
      <StatTile label="Faltante" value={formatSoles(Math.abs(props.session.shortageCents))} tone="malo" />
      <StatTile label="Sobrante" value={formatSoles(props.session.overageCents)} />
    </StatTiles>
    <Show when={props.session.differences.some((item) => item.differenceQuantity !== 0)}>
      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th class={tabla.num}>Sistema</th>
              <th class={tabla.num}>Contado</th>
              <th class={tabla.num}>Diferencia</th>
              <th class={tabla.num}>En soles</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.session.differences.filter((item) => item.differenceQuantity !== 0)}>
              {(item) => (
                <tr>
                  <td>{props.names.get(item.productId) ?? item.productId}</td>
                  <td class={tabla.num}>{item.systemQuantity}</td>
                  <td class={tabla.num}>{item.countedQuantity}</td>
                  <td class={tabla.num}>
                    {item.differenceQuantity > 0 ? '+' : ''}
                    {item.differenceQuantity}
                  </td>
                  <td class={tabla.num} classList={{ [styles.mal]: item.differenceCents < 0 }}>
                    {formatSoles(item.differenceCents)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  </Modal>
);

export const CountTab: Component = () => {
  const [refresh, setRefresh] = createSignal(0);
  const [session, { refetch: refetchSession }] = createResource(refresh, () =>
    getOpenCountSession(),
  );
  const [historyPage, setHistoryPage] = createUrlNumber('historial', 1);
  const [history, { refetch: refetchHistory }] = createResource(
    () => ({ refresh: refresh(), page: historyPage() }),
    (params) => listClosedCountSessions(params.page, HISTORY_PER_PAGE),
  );
  const closedCounts = () => history()?.items ?? [];
  const closedTotal = () => history()?.total ?? 0;
  const closedLastPage = () => Math.max(1, Math.ceil(closedTotal() / HISTORY_PER_PAGE));
  // Lo tecleado y todavía sin anotar. Solo vive acá: «Anotar» lo manda al
  // servidor, que es donde el conteo existe de verdad.
  const [drafts, setDrafts] = createSignal<Record<string, string>>({});

  // Un campo vacío no es un borrador. Sin esto, cada producto anotado dejaba
  // su entrada vacía para siempre: con un catálogo de 50 000 productos son 2 MB
  // de nada en el navegador.
  function setDraft(productId: string, value: string): void {
    const next = { ...drafts() };
    if (value.trim() === '') delete next[productId];
    else next[productId] = value;
    setDrafts(next);
  }
  const [saving, setSaving] = createSignal<string | null>(null);
  const [confirmingClose, setConfirmingClose] = createSignal(false);
  const [closeNote, setCloseNote] = createSignal('');
  const [justClosed, setJustClosed] = createSignal<ClosedCountSessionDto | null>(null);
  const [error, setError] = createSignal('');
  const [query, setQuery] = createUrlText('q');
  const [page, setPage] = createUrlNumber('pagina', 1);
  const [confirmingDiscard, setConfirmingDiscard] = createSignal(false);

  // Contar un anaquel lleva horas: lo tecleado y sin anotar sobrevive a una
  // recarga o a un corte de luz, guardado por sesión de conteo en el navegador
  // de quien cuenta. Se borra al cerrar o descartar el conteo.
  const claveConteo = (): `mana-pos:conteo:${string}` | undefined => {
    const current = session();
    return current == null ? undefined : `mana-pos:conteo:${current.id}`;
  };

  let cargadaPara: string | undefined;
  createEffect(() => {
    const current = session();
    const key = claveConteo();
    if (current == null || key === undefined || cargadaPara === current.id) return;
    cargadaPara = current.id;
    const guardado = readStored(key, decodeCountDraft);
    if (guardado === undefined) return;
    setDrafts(guardado.quantities);
    setCloseNote(guardado.closeNote);
  });

  // Con debounce: contando se teclea sin parar y no hace falta escribir el
  // borrador entero en cada tecla.
  let guardarTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const key = claveConteo();
    const borrador: CountDraft = { quantities: drafts(), closeNote: closeNote() };
    if (key === undefined) return;
    if (guardarTimer !== undefined) clearTimeout(guardarTimer);
    guardarTimer = setTimeout(() => {
      guardarTimer = undefined;
      if (isEmptyCountDraft(borrador)) removeStored(key);
      else writeStored(key, borrador);
    }, 300);
  });
  onCleanup(() => {
    if (guardarTimer !== undefined) clearTimeout(guardarTimer);
  });

  // El conteo se acabó: lo tecleado ya no sirve para nada.
  function olvidarBorrador(): void {
    const key = claveConteo();
    if (guardarTimer !== undefined) clearTimeout(guardarTimer);
    guardarTimer = undefined;
    if (key !== undefined) removeStored(key);
    setDrafts({});
    setCloseNote('');
  }

  // Se cuenta caminando el anaquel: se busca o se escanea el producto y se
  // anota. Traer las mil filas de golpe no sirve para eso y además no cabe.
  const [products] = createResource(
    () => {
      const current = session();
      if (current == null) return null;
      return { category: current.category ?? '', query: query(), page: page() };
    },
    async (params: { category: string; query: string; page: number }) =>
      searchProductsPage(params.query, params.page, PER_PAGE, false, false, {
        category: params.category,
        orderBy: 'name',
        orderDir: 'asc',
      }),
  );

  const items = () => products()?.items ?? [];
  const total = () => products()?.total ?? 0;
  const lastPage = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  const names = () => new Map(items().map((item) => [item.id, item.name]));
  const countedByProduct = () =>
    new Map((session()?.lines ?? []).map((line) => [line.productId, line.countedQuantity]));

  // Cuántos faltan de TODA la categoría, no solo de la página.
  const pending = () => Math.max(0, total() - (session()?.lines.length ?? 0));

  async function saveCount(product: ProductDto): Promise<void> {
    const current = session();
    if (current == null || saving() !== null) return;
    const quantity = toQuantity(product, drafts()[product.id] ?? '');
    if (quantity === null) return;
    setSaving(product.id);
    setError('');
    try {
      await recordCount(current.id, product.id, quantity);
      beepOk();
      setDraft(product.id, '');
      await refetchSession();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo anotar el conteo.'));
    } finally {
      setSaving(null);
    }
  }

  async function undoCount(productId: string): Promise<void> {
    const current = session();
    if (current == null) return;
    try {
      await removeCount(current.id, productId);
      await refetchSession();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo borrar el conteo.'));
    }
  }

  async function discard(): Promise<void> {
    const current = session();
    if (current == null) return;
    try {
      await discardCountSession(current.id);
      beepOk();
      olvidarBorrador();
      setConfirmingDiscard(false);
      showNotice('Conteo descartado — el stock quedó como estaba');
      setRefresh((value) => value + 1);
    } catch (cause) {
      beepError();
      setConfirmingDiscard(false);
      setError(apiErrorMessage(cause, 'No se pudo descartar el conteo.'));
    }
  }

  async function close(): Promise<void> {
    const current = session();
    if (current == null) return;
    try {
      const closed = await closeCountSession(
        current.id,
        closeNote().trim() === '' ? null : closeNote().trim(),
      );
      beepSuccess();
      olvidarBorrador();
      setConfirmingClose(false);
      setJustClosed(closed);
      showNotice(
        `Conteo cerrado: ${closed.productsMatched} de ${closed.productsCounted} cuadraron`,
      );
      setRefresh((value) => value + 1);
      await refetchHistory();
    } catch (cause) {
      beepError();
      setConfirmingClose(false);
      setError(apiErrorMessage(cause, 'No se pudo cerrar el conteo.'));
    }
  }

  return (
    <section class={tabla.vista}>
      <Show when={session() != null}>
        <div class={tabla.encabezado}>
          <input
            id="conteo-buscar"
            class={tabla.buscador}
            type="text"
            placeholder="Busca el producto por nombre, o escanea su código…"
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            class={forms.secundario}
            onClick={() => setConfirmingDiscard(true)}
          >
            Descartar
          </button>
          <button
            type="button"
            class={tabla.nuevo}
            disabled={(session()?.lines.length ?? 0) === 0}
            title={
              (session()?.lines.length ?? 0) === 0
                ? 'Anota al menos un producto, o descarta el conteo'
                : 'Ajusta el stock de lo contado y deja el resumen'
            }
            onClick={() => setConfirmingClose(true)}
          >
            Cerrar conteo
          </button>
        </div>
      </Show>

      <Show when={error() !== ''}>
        <p class={forms.error}>{error()}</p>
      </Show>

      <Show
        when={session()}
        fallback={
          <Show when={!session.loading}>
            <StartPanel onStarted={() => setRefresh((value) => value + 1)} />
          </Show>
        }
      >
        {(current: () => OpenCountSessionDto) => (
          <>
            <div class={styles.estado}>
              <span class={styles.avance}>
                <b>{current().lines.length}</b> contados · <b>{pending()}</b> por contar
              </span>
              <span class={styles.contexto}>
                {current().category === null ? 'Toda la tienda' : current().category} · empezó{' '}
                {current().openedBy} el {formatDateTime(current().openedAt)}
              </span>
              <span class={styles.aviso}>El stock no se mueve hasta cerrar</span>
            </div>
            <div class={tabla.tablaContenedor}>
              <table class={tabla.tabla}>
                <colgroup>
                  <col />
                  <col class={styles.colSistema} />
                  <col class={styles.colContado} />
                  <col class={styles.colAccion} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class={tabla.num}>Sistema</th>
                    <th class={tabla.num}>Contado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <For each={items()}>
                    {(product) => {
                      const counted = () => countedByProduct().get(product.id);
                      return (
                        <tr classList={{ [styles.filaContada]: counted() !== undefined }}>
                          <td class={styles.celdaNombre}>{product.name}</td>
                          <td class={tabla.num}>{quantityLabel(product, stockOf(product))}</td>
                          <td class={tabla.num}>
                            <Show
                              when={counted() === undefined}
                              fallback={
                                <b class={styles.yaContado}>
                                  {quantityLabel(product, counted() ?? 0)}
                                </b>
                              }
                            >
                              <input
                                id={`conteo-${product.id}`}
                                class={styles.entrada}
                                type="number"
                                min="0"
                                step={product.saleType === 'weight' ? '0.1' : '1'}
                                inputmode="decimal"
                                aria-label={`Cantidad contada de ${product.name}`}
                                value={drafts()[product.id] ?? ''}
                                onInput={(event) =>
                                  setDraft(product.id, event.currentTarget.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void saveCount(product);
                                }}
                              />
                            </Show>
                          </td>
                          <td class={tabla.acciones}>
                            <Show
                              when={counted() === undefined}
                              fallback={
                                <button
                                  type="button"
                                  class={forms.secundario}
                                  onClick={() => void undoCount(product.id)}
                                >
                                  Volver a contar
                                </button>
                              }
                            >
                              <button
                                type="button"
                                class={forms.secundario}
                                disabled={
                                  saving() === product.id ||
                                  toQuantity(product, drafts()[product.id] ?? '') === null
                                }
                                onClick={() => void saveCount(product)}
                              >
                                Anotar
                              </button>
                            </Show>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
              <Show when={!products.loading && items().length === 0}>
                <EmptyState message="Ningún producto coincide con la búsqueda." />
              </Show>
            </div>

            <TableFooter
              total={total()}
              singular="producto"
              plural="productos"
              page={page()}
              lastPage={lastPage()}
              onPage={setPage}
            />
          </>
        )}
      </Show>

      <div class={tabla.encabezado} style={{ 'margin-top': '4px' }}>
        <h3 class={styles.tituloHistorial}>Conteos anteriores</h3>
      </div>
      <Show
        when={closedCounts().length > 0}
        fallback={
          <EmptyState message="Todavía no cerraste ningún conteo. Los conteos cerrados quedan aquí con su faltante y su sobrante." />
        }
      >
        <div class={tabla.tablaContenedor}>
          <table class={tabla.tabla}>
            <thead>
              <tr>
                <th>Cerrado</th>
                <th>Categoría</th>
                <th class={tabla.num}>Contados</th>
                <th class={tabla.num}>Cuadraron</th>
                <th class={tabla.num}>Faltante</th>
                <th class={tabla.num}>Sobrante</th>
                <th>Cerró</th>
              </tr>
            </thead>
            <tbody>
              <For each={closedCounts()}>
                {(closed) => (
                  <tr>
                    <td class={tabla.sub}>{formatDateTime(closed.closedAt)}</td>
                    <td>{closed.category === null ? 'toda la tienda' : categoryName(closed.category)}</td>
                    <td class={tabla.num}>{closed.productsCounted}</td>
                    <td class={tabla.num}>{closed.productsMatched}</td>
                    <td class={tabla.num} classList={{ [styles.mal]: closed.shortageCents !== 0 }}>
                      {formatSoles(Math.abs(closed.shortageCents))}
                    </td>
                    <td class={tabla.num}>{formatSoles(closed.overageCents)}</td>
                    <td>{closed.closedBy}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <TableFooter
          total={closedTotal()}
          singular="conteo cerrado"
          plural="conteos cerrados"
          page={historyPage()}
          lastPage={closedLastPage()}
          onPage={setHistoryPage}
        />
      </Show>

      <Show when={confirmingDiscard()}>
        <ConfirmModal
          title="Descartar el conteo"
          confirmLabel="Descartar"
          onConfirm={() => void discard()}
          onClose={() => setConfirmingDiscard(false)}
        >
          <p class={forms.nota}>
            Se borra lo anotado
            {(session()?.lines.length ?? 0) > 0
              ? ` (${session()?.lines.length} productos)`
              : ''}{' '}
            y el stock queda como está. Úsalo si empezaste por error.
          </p>
        </ConfirmModal>
      </Show>

      <Show when={confirmingClose()}>
        <ConfirmModal
          title="Cerrar el conteo"
          confirmLabel="Cerrar y ajustar stock"
          onConfirm={() => void close()}
          onClose={() => setConfirmingClose(false)}
        >
          <p class={forms.nota}>
            Se ajusta el stock de los {session()?.lines.length ?? 0} productos anotados y queda el
            resumen de diferencias. Esto no se puede deshacer.
          </p>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Nota (opcional)</span>
            <input
              id="conteo-nota"
              class={forms.input}
              value={closeNote()}
              placeholder="p. ej. contamos Rosa y yo, domingo en la mañana"
              onInput={(event) => setCloseNote(event.currentTarget.value)}
            />
          </div>
        </ConfirmModal>
      </Show>

      <Show when={justClosed()}>
        {(closed) => (
          <ClosedSummary
            session={closed()}
            names={names()}
            onClose={() => setJustClosed(null)}
          />
        )}
      </Show>
    </section>
  );
};
