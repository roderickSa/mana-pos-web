import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';
import { focusOnMount } from '@/shared/lib/focus';

import { getProduct, searchProductsPage, updateProduct } from '@/shared/api/products';
import { downloadFile } from '@/shared/api/client';
import { listSuppliers } from '@/shared/api/suppliers';
import { formatKg, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { allCategories } from '@/shared/state/categories';
import { TableFooter } from '@/shared/ui/TableFooter';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { ActionsMenu } from './ActionsMenu';
import { CountModal } from '@/shared/ui/CountModal';
import { ImportModal } from './ImportModal';
import { MergeModal } from './MergeModal';
import { BulkPricesModal } from './BulkPricesModal';
import { PriceModal } from './PriceModal';
import { ProductFormModal } from './ProductFormModal';
import { costOf, minimumOf, priceOf, stockOf } from '@/shared/lib/product-units';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import { EmptyState } from '@/shared/ui/EmptyState';
import {
  createUrlBoolean,
  createUrlNumber,
  createUrlOption,
  createUrlText,
} from '@/shared/lib/url-state';
import { subPath, withSearch, withSearchParam } from '@/shared/lib/modal-route';
import {
  openProductId,
  parseProductModal,
  productActionPath,
  PRODUCTS_PATH,
  type ProductModalRoute,
} from './products-route';

const PER_PAGE = 50;

function stockLabel(product: ProductDto): string {
  return product.saleType === 'unit' ? `${product.stockUnits} unid.` : formatKg(product.stockGrams);
}

const SORT_COLUMNS = ['name', 'price', 'stock', 'margin'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export const ProductsTab: Component = () => {
  // Búsqueda, filtros y página van en la URL: la pantalla se recarga y se
  // comparte tal como quedó.
  const [query, setQuery] = createUrlText('q');
  const [page, setPage] = createUrlNumber('pagina', 1);
  const [lowOnly, setLowOnly] = createUrlBoolean('bajo', false);
  const [noCostOnly, setNoCostOnly] = createUrlBoolean('sin-costo', false);
  const [category, setCategory] = createUrlText('categoria');
  const [sortByRaw, setSortByRaw] = createUrlText('orden');
  const [sortDir, setSortDir] = createUrlOption('dir', ['asc', 'desc'] as const, 'asc');
  const sortBy = (): SortColumn | null =>
    SORT_COLUMNS.find((column) => column === sortByRaw()) ?? null;
  const setSortBy = (column: SortColumn | null): void => setSortByRaw(column ?? '');
  // Qué modal está abierto lo dice la URL, no una señal: `/productos/p-1/editar`
  // se puede recargar, compartir y cerrar con el botón Atrás.
  const location = useLocation();
  const navigate = useNavigate();
  const modal = (): ProductModalRoute => parseProductModal(subPath(PRODUCTS_PATH, location.pathname));
  const [initialBarcode] = createUrlText('codigo');
  const abrir = (path: string): void => navigate(withSearch(path, location.search));
  const cerrar = (): void => navigate(withSearch(PRODUCTS_PATH, location.search));
  // Captura de costos en línea: id del producto en edición y su valor.
  const [costEditing, setCostEditing] = createSignal<string | null>(null);
  const [costDraft, setCostDraft] = createSignal('');

  const [result, { refetch }] = createResource(
    () => ({
      query: query(),
      page: page(),
      lowOnly: lowOnly(),
      noCostOnly: noCostOnly(),
      category: category(),
      sortBy: sortBy(),
      sortDir: sortDir(),
    }),
    (params) =>
      searchProductsPage(params.query, params.page, PER_PAGE, params.lowOnly, params.noCostOnly, {
        category: params.category,
        ...(params.sortBy === null ? {} : { orderBy: params.sortBy, orderDir: params.sortDir }),
      }),
  );

  // Clic en encabezado: 1.º asc, 2.º desc, 3.º vuelve al orden normal.
  function toggleSort(column: SortColumn): void {
    if (sortBy() !== column) {
      setSortBy(column);
      setSortDir('asc');
    } else if (sortDir() === 'asc') {
      setSortDir('desc');
    } else {
      setSortBy(null);
      setSortDir('asc');
    }
    setPage(1);
  }

  const sortMark = (column: SortColumn) =>
    sortBy() !== column ? '' : sortDir() === 'asc' ? ' ▲' : ' ▼';
  // Conteos reales en TODO el catálogo (no solo la página visible).
  const [lowTotal, { refetch: refetchLowTotal }] = createResource(async () => {
    const response = await searchProductsPage('', 1, 1, true);
    return response.total;
  });
  const [noCostTotal, { refetch: refetchNoCostTotal }] = createResource(async () => {
    const response = await searchProductsPage('', 1, 1, false, true);
    return response.total;
  });

  async function saveInlineCost(product: ProductDto): Promise<void> {
    const cents = solesInputToCents(costDraft());
    if (cents === null || cents <= 0) return;
    try {
      await updateProduct(product.id, {
        barcode: product.barcode,
        shortCode: product.shortCode,
        name: product.name,
        category: product.category,
        priceCents: priceOf(product),
        costCents: cents,
        stockMinimum: minimumOf(product),
        active: product.active,
        quickAccess: product.quickAccess,
      });
      beepSuccess();
      showNotice(`Costo de «${product.name}» capturado`);
      setCostEditing(null);
      setCostDraft('');
      void refetch();
      void refetchNoCostTotal();
    } catch {
      showNotice('No se pudo guardar el costo.');
    }
  }
  const [suppliers, { refetch: refetchSuppliers }] = createResource(listSuppliers);

  const items = () => result()?.items ?? [];

  // El producto del modal sale de la página cargada si está ahí (abrir desde
  // una fila es instantáneo) y se pide al servidor si no (entrar por la URL de
  // frente, o volver a una página que ya no lo trae).
  const enLista = (id: string): ProductDto | undefined =>
    items().find((product) => product.id === id);
  const [buscado] = createResource(
    () => {
      const id = openProductId(modal());
      return id === undefined || enLista(id) !== undefined ? undefined : id;
    },
    (id) => getProduct(id),
  );
  const abierto = (): ProductDto | undefined => {
    const id = openProductId(modal());
    if (id === undefined) return undefined;
    // Comparar el id importa: mientras se busca el siguiente, el recurso
    // todavía devuelve el anterior, y la pantalla mostraría un producto que
    // no es el de la URL.
    const encontrado = enLista(id) ?? buscado();
    return encontrado?.id === id ? encontrado : undefined;
  };

  // Un id que ya no existe (producto borrado, link viejo) devuelve al listado
  // en vez de dejar la pantalla a medias.
  createEffect(() => {
    if (openProductId(modal()) === undefined) return;
    if (result.loading || buscado.loading) return;
    if (abierto() !== undefined) return;
    showNotice('Ese producto ya no está');
    navigate(withSearch(PRODUCTS_PATH, location.search), { replace: true });
  });
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));
  // Columna de proveedor solo cuando hay datos que mostrar.
  const showSupplierColumn = () => items().some((product) => product.supplierIds.length > 0);

  const supplierNames = (supplierIds: string[]) => {
    if (supplierIds.length === 0) return '—';
    const all = suppliers() ?? [];
    return supplierIds
      .map((id) => all.find((supplier) => supplier.id === id)?.name ?? '…')
      .join(', ');
  };

  function closeAndRefresh(message: string): void {
    cerrar();
    beepSuccess();
    showNotice(message);
    void refetch();
    void refetchLowTotal();
    void refetchNoCostTotal();
    void refetchSuppliers();
  }

  // Nombre bonito de la categoría: el slug es cosa interna. Incluye las
  // inactivas — sus productos siguen existiendo y merecen nombre.
  const categoryName = (slug: string) =>
    allCategories().find((item) => item.slug === slug)?.name ?? slug;

  function toggleLowOnly(): void {
    setLowOnly(!lowOnly());
    setPage(1);
  }

  const queryIsBarcode = () => /^\d{6,}$/.test(query().trim());

  return (
    <section class={styles.vista}>
      <div class={styles.encabezado}>
        <input
          ref={focusOnMount}
          class={styles.buscador}
          type="text"
          placeholder="Buscar por nombre o código de barras…"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
        <select
          class={forms.select}
          style={{ 'max-width': '190px' }}
          aria-label="Categoría"
          value={category()}
          onChange={(event) => {
            setCategory(event.currentTarget.value);
            setPage(1);
          }}
        >
          <option value="">Todas las categorías</option>
          <For each={allCategories()}>
            {(item) => (
              <option value={item.slug}>{item.active ? item.name : `${item.name} (inactiva)`}</option>
            )}
          </For>
        </select>
        <Show when={(noCostTotal() ?? 0) > 0 || noCostOnly()}>
          <button
            type="button"
            class={styles.alertaBajo}
            classList={{ [styles.alertaBajoActiva]: noCostOnly() }}
            title={
              noCostOnly()
                ? 'Quitar el filtro'
                : 'Ver solo productos sin costo y capturarlos desde la tabla'
            }
            onClick={() => {
              setNoCostOnly(!noCostOnly());
              setPage(1);
            }}
          >
            {noCostTotal() === 1 ? '1 producto sin costo' : `${noCostTotal() ?? 0} productos sin costo`}
            {noCostOnly() ? ' ✕' : ''}
          </button>
        </Show>
        <Show when={(lowTotal() ?? 0) > 0 || lowOnly()}>
          <button
            type="button"
            class={styles.alertaBajo}
            classList={{ [styles.alertaBajoActiva]: lowOnly() }}
            title={lowOnly() ? 'Quitar el filtro de stock bajo' : 'Ver solo productos con stock bajo'}
            onClick={toggleLowOnly}
          >
            {lowTotal() === 1 ? '1 producto con stock bajo' : `${lowTotal() ?? 0} productos con stock bajo`}
            {lowOnly() ? ' ✕' : ''}
          </button>
        </Show>
        <button
          type="button"
          class={styles.importar}
          title="Descarga todo el inventario en Excel (también sirve como respaldo legible)"
          onClick={() =>
            void downloadFile('/catalog/products/export.xlsx', 'inventario-mana.xlsx').catch(() =>
              showNotice('No se pudo exportar el inventario.'),
            )
          }
        >
          Exportar
        </button>
        <button
          type="button"
          class={styles.importar}
          onClick={() => abrir(`${PRODUCTS_PATH}/importar`)}
        >
          Importar Excel
        </button>
        <button
          type="button"
          class={styles.importar}
          title="Cambio masivo de precios y sugerencias por margen"
          onClick={() => abrir(`${PRODUCTS_PATH}/precios`)}
        >
          Precios…
        </button>
        <button
          type="button"
          class={styles.nuevo}
          onClick={() =>
            navigate(withSearchParam(`${PRODUCTS_PATH}/nuevo`, location.search, 'codigo', null))
          }
        >
          + Nuevo producto
        </button>
      </div>

      <div class={styles.tablaContenedor}>
        <table class={styles.tabla}>
          <thead>
            <tr>
              <th>
                <button type="button" class={styles.ordenable} onClick={() => toggleSort('name')}>
                  Producto{sortMark('name')}
                </button>
              </th>
              <th>Categoría</th>
              <Show when={showSupplierColumn()}>
                <th>Proveedor</th>
              </Show>
              <th class={styles.num}>
                <button type="button" class={styles.ordenable} onClick={() => toggleSort('stock')}>
                  Stock{sortMark('stock')}
                </button>
              </th>
              <th class={styles.num}>Mínimo</th>
              <th class={styles.num}>
                <button type="button" class={styles.ordenable} onClick={() => toggleSort('price')}>
                  Precio{sortMark('price')}
                </button>
              </th>
              <th class={styles.num}>Costo</th>
              <th class={styles.num}>
                <button type="button" class={styles.ordenable} onClick={() => toggleSort('margin')}>
                  Margen{sortMark('margin')}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={items()}>
              {(product) => {
                const low = () => stockOf(product) <= minimumOf(product);
                const out = () => stockOf(product) <= 0;
                // Sin costo real capturado no se inventa margen: se muestra "—".
                const hasCost = costOf(product) > 0;
                const marginCents = priceOf(product) - costOf(product);
                const marginPct =
                  priceOf(product) > 0 ? Math.round((marginCents / priceOf(product)) * 100) : 0;
                return (
                  <tr classList={{ [styles.inactivo]: !product.active }}>
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
                          <div class={styles.sub}>
                            {product.barcode ?? 'sin código'}
                            {product.saleType === 'weight' ? ' · por kg' : ''}
                            {!product.active ? ' · inactivo' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{categoryName(product.category)}</td>
                    <Show when={showSupplierColumn()}>
                      <td class={styles.sub}>{supplierNames(product.supplierIds)}</td>
                    </Show>
                    <td class={styles.num}>
                      <span
                        class={styles.stock}
                        classList={{ [styles.stockBajo]: low() && !out(), [styles.stockCero]: out() }}
                      >
                        {stockLabel(product)}
                      </span>
                    </td>
                    <td class={`${styles.num} ${styles.sub}`}>
                      <Show
                        when={minimumOf(product) > 0}
                        fallback={
                          <span
                            class={styles.sinMinimo}
                            title="Sin mínimo configurado: este producto nunca alertará stock bajo"
                          >
                            sin mínimo
                          </span>
                        }
                      >
                        {product.saleType === 'unit'
                          ? product.stockMinimum
                          : formatKg(product.stockMinimumGrams)}
                      </Show>
                    </td>
                    <td class={styles.num}>{formatSoles(priceOf(product))}</td>
                    <td class={`${styles.num} ${styles.sub}`}>
                      <Show
                        when={noCostOnly()}
                        fallback={hasCost ? formatSoles(costOf(product)) : '—'}
                      >
                        <Show
                          when={costEditing() === product.id}
                          fallback={
                            <button
                              type="button"
                              onClick={() => {
                                setCostEditing(product.id);
                                setCostDraft('');
                              }}
                            >
                              Capturar costo
                            </button>
                          }
                        >
                          <input
                            style={{ 'max-width': '110px' }}
                            type="number"
                            step="0.10"
                            min="0"
                            placeholder="S/"
                            value={costDraft()}
                            onInput={(event) => setCostDraft(event.currentTarget.value)}
                            onKeyDown={(event) => event.key === 'Enter' && void saveInlineCost(product)}
                            autofocus
                          />
                          <button type="button" onClick={() => void saveInlineCost(product)}>
                            OK
                          </button>
                        </Show>
                      </Show>
                    </td>
                    <td class={styles.num}>
                      <Show
                        when={hasCost}
                        fallback={
                          <span
                            class={styles.sub}
                            title="Sin costo registrado: captúralo en una entrada de mercancía o editando el producto"
                          >
                            —
                          </span>
                        }
                      >
                        <span class={styles.margen} classList={{ [styles.margenNegativo]: marginCents < 0 }}>
                          {formatSoles(marginCents)} · {marginPct}%
                        </span>
                      </Show>
                    </td>
                    <td class={styles.acciones}>
                      <ActionsMenu onSelect={(action) => abrir(productActionPath(product.id, action))} />
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <EmptyState
            message={`No hay productos que coincidan con «${query()}».`}
            action={
              <Show when={queryIsBarcode()}>
                <button
                  type="button"
                  class={styles.nuevo}
                  onClick={() =>
                    navigate(
                      withSearchParam(
                        `${PRODUCTS_PATH}/nuevo`,
                        location.search,
                        'codigo',
                        query().trim(),
                      ),
                    )
                  }
                >
                  Crear producto con el código {query().trim()}
                </button>
              </Show>
            }
          />
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

      {renderModal(modal(), abierto(), initialBarcode(), closeAndRefresh, cerrar)}
    </section>
  );
};

// `product` llega sin resolver mientras se busca por id (al abrir la URL de
// frente, sin pasar por el listado): ahí todavía no hay nada que dibujar.
function renderModal(
  state: ProductModalRoute,
  product: ProductDto | undefined,
  initialBarcode: string,
  onDone: (message: string) => void,
  onClose: () => void,
) {
  switch (state.kind) {
    case 'none':
      return null;
    case 'create':
      return (
        <ProductFormModal
          mode={{ kind: 'create', initialBarcode: initialBarcode === '' ? null : initialBarcode }}
          onDone={onDone}
          onClose={onClose}
        />
      );
    case 'import':
      return <ImportModal onDone={onDone} onClose={onClose} />;
    case 'bulk-prices':
      return (
        <BulkPricesModal
          onApplied={() => onDone('Precios actualizados.')}
          onClose={onClose}
        />
      );
    case 'edit':
      if (product === undefined) return null;
      return (
        <ProductFormModal mode={{ kind: 'edit', product }} onDone={onDone} onClose={onClose} />
      );
    case 'price':
      if (product === undefined) return null;
      return <PriceModal product={product} onDone={onDone} onClose={onClose} />;
    case 'stock':
      if (product === undefined) return null;
      return <CountModal product={product} onDone={onDone} onClose={onClose} />;
    case 'merge':
      if (product === undefined) return null;
      return <MergeModal product={product} onDone={onDone} onClose={onClose} />;
  }
}
