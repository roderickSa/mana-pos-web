import { createEffect, createResource, For, Show, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import { focusOnMount } from '@/shared/lib/focus';

import { getProduct, searchProductsPage } from '@/shared/api/products';
import { formatKg } from '@/shared/lib/money';
import { beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { TableFooter } from '@/shared/ui/TableFooter';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { EmptyState } from '@/shared/ui/EmptyState';
import { AdjustmentModal } from './AdjustmentModal';
import { CountModal } from '@/shared/ui/CountModal';
import { EntryModal } from './EntryModal';
import { KardexModal } from './KardexModal';
import { RowMenu } from '@/shared/ui/RowMenu';
import styles from '@/shared/ui/tabla.module.css';
import { createUrlNumber, createUrlText } from '@/shared/lib/url-state';
import { entityAction, subPath, withSearch } from '@/shared/lib/modal-route';

const PER_PAGE = 50;

const ENTRADAS_PATH = '/inventario/entradas';
// Los nombres de la URL son los de la pantalla: /entradas/<id>/merma.
const ACCIONES = ['entrada', 'merma', 'conteo', 'kardex'] as const;

export const AdjustmentsTab: Component = () => {
  const navigate = useNavigate();
  const [query, setQuery] = createUrlText('q');
  const [page, setPage] = createUrlNumber('pagina', 1);
  // Qué modal está abierto lo dice la URL, no una señal.
  const location = useLocation();
  const abierta = () => entityAction(subPath(ENTRADAS_PATH, location.pathname), ACCIONES);
  const abrir = (id: string, accion: (typeof ACCIONES)[number]): void =>
    navigate(withSearch(`${ENTRADAS_PATH}/${id}/${accion}`, location.search));
  const cerrar = (): void => navigate(withSearch(ENTRADAS_PATH, location.search));

  const [result, { refetch }] = createResource(
    () => ({ query: query(), page: page() }),
    (params) => searchProductsPage(params.query, params.page, PER_PAGE),
  );

  const items = () => result()?.items ?? [];

  // El producto sale de la página cargada si está ahí, y se pide por id si se
  // entró a la URL de frente.
  const enLista = (id: string): ProductDto | undefined =>
    items().find((product) => product.id === id);
  const [buscado] = createResource(
    () => {
      const abierto = abierta();
      return abierto === undefined || enLista(abierto.id) !== undefined ? undefined : abierto.id;
    },
    (id) => getProduct(id),
  );
  const producto = (): ProductDto | undefined => {
    const abierto = abierta();
    if (abierto === undefined) return undefined;
    // Mientras se busca el siguiente, el recurso devuelve el anterior: sin
    // comparar el id, el modal mostraría otro producto que el de la URL.
    const encontrado = enLista(abierto.id) ?? buscado();
    return encontrado?.id === abierto.id ? encontrado : undefined;
  };

  createEffect(() => {
    if (abierta() === undefined) return;
    if (result.loading || buscado.loading) return;
    if (producto() !== undefined) return;
    showNotice('Ese producto ya no está');
    navigate(withSearch(ENTRADAS_PATH, location.search), { replace: true });
  });
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  function closeAndRefresh(message: string): void {
    beepSuccess();
    cerrar();
    showNotice(message);
    void refetch();
  }

  return (
    <section class={styles.vista}>
      <div class={styles.encabezado}>
        <input
          ref={focusOnMount}
          class={styles.buscador}
          type="text"
          placeholder="Busca el producto a ajustar (nombre o código)…"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
      </div>

      <div class={styles.tablaContenedor}>
        <table class={styles.tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th class={styles.num}>Stock actual</th>
              <th>Operaciones</th>
            </tr>
          </thead>
          <tbody>
            <For each={items()}>
              {(product) => (
                <tr>
                  <td>
                    <div class={styles.productoCelda}>
                      <span class={styles.thumb}>
                        <Show
                          when={product.imagePath}
                          fallback={<CategoryIcon category={product.category} />}
                        >
                          {(imagePath) => <img src={imagePath()} alt="" loading="lazy" />}
                        </Show>
                      </span>
                      <div>
                        <div class={styles.nombre}>{product.name}</div>
                        <div class={styles.sub}>{product.barcode ?? 'sin código'}</div>
                      </div>
                    </div>
                  </td>
                  <td class={styles.num}>
                    <span class={styles.stock}>
                      {product.saleType === 'unit'
                        ? `${product.stockUnits} unid.`
                        : formatKg(product.stockGrams)}
                    </span>
                  </td>
                  {/* Lo frecuente a la vista; conteo y kardex al menú ⋯. */}
                  <td class={styles.acciones}>
                    <button type="button" onClick={() => abrir(product.id, 'entrada')}>
                      Entrada
                    </button>
                    <button type="button" onClick={() => abrir(product.id, 'merma')}>
                      Merma
                    </button>
                    <RowMenu
                      items={[
                        { key: 'count', label: 'Conteo físico' },
                        { key: 'kardex', label: 'Ver kardex' },
                      ]}
                      onSelect={(key) => abrir(product.id, key === 'count' ? 'conteo' : 'kardex')}
                    />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <EmptyState message="No hay productos que coincidan con la búsqueda." />
        </Show>
      </div>

      <TableFooter
        total={total()}
        singular="producto"
        plural="productos"
        page={page()}
        lastPage={totalPages()}
        onPage={setPage}
      />

      {(() => {
        const abierto = abierta();
        const product = producto();
        if (abierto === undefined || product === undefined) return null;
        switch (abierto.action) {
          case 'entrada':
            return <EntryModal product={product} onDone={closeAndRefresh} onClose={cerrar} />;
          case 'merma':
            return <AdjustmentModal product={product} onDone={closeAndRefresh} onClose={cerrar} />;
          case 'conteo':
            return <CountModal product={product} onDone={closeAndRefresh} onClose={cerrar} />;
          case 'kardex':
            return (
              <KardexModal
                product={product}
                onClose={cerrar}
                onGoToKardex={() =>
                  navigate(`/inventario/kardex?q=${encodeURIComponent(product.name)}`)
                }
              />
            );
        }
      })()}
    </section>
  );
};
