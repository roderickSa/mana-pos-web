import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { focusOnMount } from '@/shared/lib/focus';

import { searchProductsPage, updateProduct } from '@/shared/api/products';
import { downloadFile } from '@/shared/api/client';
import { listSuppliers } from '@/shared/api/suppliers';
import { formatKg, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { allCategories } from '@/shared/state/categories';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { ActionsMenu, type ProductAction } from './ActionsMenu';
import { CountModal } from '@/shared/ui/CountModal';
import { ImportModal } from './ImportModal';
import { MergeModal } from './MergeModal';
import { BulkPricesModal } from './BulkPricesModal';
import { PriceModal } from './PriceModal';
import { ProductFormModal } from './ProductFormModal';
import { costOf, minimumOf, priceOf, stockOf } from '@/shared/lib/product-units';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

const PER_PAGE = 50;

type ModalState =
  | { kind: 'none' }
  | { kind: 'create'; initialBarcode: string | null }
  | { kind: 'import' }
  | { kind: 'bulk-prices' }
  | { kind: ProductAction; product: ProductDto };

function stockLabel(product: ProductDto): string {
  return product.saleType === 'unit' ? `${product.stockUnits} unid.` : formatKg(product.stockGrams);
}

type SortColumn = 'name' | 'price' | 'stock' | 'margin';

export const ProductsTab: Component = () => {
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [lowOnly, setLowOnly] = createSignal(false);
  const [noCostOnly, setNoCostOnly] = createSignal(false);
  const [category, setCategory] = createSignal('');
  const [sortBy, setSortBy] = createSignal<SortColumn | null>(null);
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc');
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });
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
        supplierIds: product.supplierIds,
        priceCents: priceOf(product),
        costCents: cents,
        packSize: product.saleType === 'unit' ? product.packSize : null,
        packCostCents: product.saleType === 'unit' ? product.packCostCents : null,
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
    setModal({ kind: 'none' });
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
    setLowOnly((value) => !value);
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
              setNoCostOnly((value) => !value);
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
          onClick={() => setModal({ kind: 'import' })}
        >
          Importar Excel
        </button>
        <button
          type="button"
          class={styles.importar}
          title="Cambio masivo de precios y sugerencias por margen"
          onClick={() => setModal({ kind: 'bulk-prices' })}
        >
          Precios…
        </button>
        <button
          type="button"
          class={styles.nuevo}
          onClick={() => setModal({ kind: 'create', initialBarcode: null })}
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
                      <Show when={product.saleType === 'unit' && product.packSize !== null}>
                        <div
                          class={styles.sub}
                          title="Este producto se compra por caja: costo unitario derivado"
                        >
                          caja ×{product.saleType === 'unit' ? product.packSize : ''}
                        </div>
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
                      <ActionsMenu onSelect={(action) => setModal({ kind: action, product })} />
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
        <Show when={!result.loading && items().length === 0}>
          <div class={styles.vacio}>
            <p>No hay productos que coincidan con «{query()}».</p>
            <Show when={queryIsBarcode()}>
              <button
                type="button"
                class={styles.nuevo}
                onClick={() => setModal({ kind: 'create', initialBarcode: query().trim() })}
              >
                Crear producto con el código {query().trim()}
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <div class={styles.paginacion}>
        <button type="button" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
          ‹ Anterior
        </button>
        <span>
          Página {page()} de {totalPages()} · {total()} productos
        </span>
        <button type="button" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
          Siguiente ›
        </button>
      </div>

      {renderModal(modal(), closeAndRefresh, () => setModal({ kind: 'none' }))}
    </section>
  );
};

function renderModal(state: ModalState, onDone: (message: string) => void, onClose: () => void) {
  switch (state.kind) {
    case 'none':
      return null;
    case 'create':
      return (
        <ProductFormModal
          mode={state}
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
      return (
        <ProductFormModal mode={{ kind: 'edit', product: state.product }} onDone={onDone} onClose={onClose} />
      );
    case 'price':
      return <PriceModal product={state.product} onDone={onDone} onClose={onClose} />;
    case 'stock':
      return <CountModal product={state.product} onDone={onDone} onClose={onClose} />;
    case 'merge':
      return <MergeModal product={state.product} onDone={onDone} onClose={onClose} />;
  }
}
