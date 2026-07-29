import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { searchProductsPage } from '@/shared/api/products';
import { listSuppliers } from '@/shared/api/suppliers';
import { formatKg, formatSoles } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { ActionsMenu, type ProductAction } from './ActionsMenu';
import { CountModal } from './CountModal';
import { ImportModal } from './ImportModal';
import { PriceModal } from './PriceModal';
import { ProductFormModal } from './ProductFormModal';
import { costOf, minimumOf, priceOf, stockOf } from './product-units';
import styles from '@/shared/ui/tabla.module.css';

const PER_PAGE = 25;

type ModalState =
  | { kind: 'none' }
  | { kind: 'create'; initialBarcode: string | null }
  | { kind: 'import' }
  | { kind: ProductAction; product: ProductDto };

function stockLabel(product: ProductDto): string {
  return product.saleType === 'unit' ? `${product.stockUnits} unid.` : formatKg(product.stockGrams);
}

export const ProductsTab: Component = () => {
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  const [result, { refetch }] = createResource(
    () => ({ query: query(), page: page() }),
    (params) => searchProductsPage(params.query, params.page, PER_PAGE),
  );
  const [suppliers, { refetch: refetchSuppliers }] = createResource(listSuppliers);

  const items = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  const supplierName = (supplierId: string | null) => {
    if (supplierId === null) return '—';
    return (suppliers() ?? []).find((supplier) => supplier.id === supplierId)?.name ?? '…';
  };

  function closeAndRefresh(message: string): void {
    setModal({ kind: 'none' });
    showNotice(message);
    void refetch();
    void refetchSuppliers();
  }

  const lowCount = () =>
    items().filter((product) => product.active && stockOf(product) <= minimumOf(product)).length;

  const queryIsBarcode = () => /^\d{6,}$/.test(query().trim());

  return (
    <section class={styles.vista}>
      <div class={styles.encabezado}>
        <input
          class={styles.buscador}
          type="text"
          placeholder="Buscar por nombre o código de barras…"
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
        <Show when={lowCount() > 0}>
          <span class={styles.alertaBajo}>
            {lowCount() === 1 ? '1 producto con stock bajo' : `${lowCount()} productos con stock bajo`}
          </span>
        </Show>
        <button
          type="button"
          class={styles.importar}
          onClick={() => setModal({ kind: 'import' })}
        >
          Importar Excel
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
              <th>Producto</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th class={styles.num}>Stock</th>
              <th class={styles.num}>Mínimo</th>
              <th class={styles.num}>Precio</th>
              <th class={styles.num}>Costo</th>
              <th class={styles.num}>Margen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={items()}>
              {(product) => {
                const low = () => stockOf(product) <= minimumOf(product);
                const out = () => stockOf(product) <= 0;
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
                    <td>{product.category}</td>
                    <td class={styles.sub}>{supplierName(product.supplierId)}</td>
                    <td class={styles.num}>
                      <span
                        class={styles.stock}
                        classList={{ [styles.stockBajo]: low() && !out(), [styles.stockCero]: out() }}
                      >
                        {stockLabel(product)}
                      </span>
                    </td>
                    <td class={`${styles.num} ${styles.sub}`}>
                      {product.saleType === 'unit'
                        ? product.stockMinimum
                        : formatKg(product.stockMinimumGrams)}
                    </td>
                    <td class={styles.num}>{formatSoles(priceOf(product))}</td>
                    <td class={`${styles.num} ${styles.sub}`}>{formatSoles(costOf(product))}</td>
                    <td class={styles.num}>
                      <span class={styles.margen} classList={{ [styles.margenNegativo]: marginCents < 0 }}>
                        {formatSoles(marginCents)} · {marginPct}%
                      </span>
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
          product={null}
          initialBarcode={state.initialBarcode}
          onDone={onDone}
          onClose={onClose}
        />
      );
    case 'import':
      return <ImportModal onDone={onDone} onClose={onClose} />;
    case 'edit':
      return (
        <ProductFormModal product={state.product} initialBarcode={null} onDone={onDone} onClose={onClose} />
      );
    case 'price':
      return <PriceModal product={state.product} onDone={onDone} onClose={onClose} />;
    case 'stock':
      return <CountModal product={state.product} onDone={onDone} onClose={onClose} />;
  }
}
