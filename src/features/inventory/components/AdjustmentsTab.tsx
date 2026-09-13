import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { focusOnMount } from '@/shared/lib/focus';

import { searchProductsPage } from '@/shared/api/products';
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

const PER_PAGE = 50;

type ModalState =
  | { kind: 'none' }
  | { kind: 'entry' | 'adjust' | 'count' | 'kardex'; product: ProductDto };

export const AdjustmentsTab: Component<{ onGoToKardex: () => void }> = (props) => {
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  const [result, { refetch }] = createResource(
    () => ({ query: query(), page: page() }),
    (params) => searchProductsPage(params.query, params.page, PER_PAGE),
  );

  const items = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  function closeAndRefresh(message: string): void {
    beepSuccess();
    setModal({ kind: 'none' });
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
                    <button type="button" onClick={() => setModal({ kind: 'entry', product })}>
                      Entrada
                    </button>
                    <button type="button" onClick={() => setModal({ kind: 'adjust', product })}>
                      Merma
                    </button>
                    <RowMenu
                      items={[
                        { key: 'count', label: 'Conteo físico' },
                        { key: 'kardex', label: 'Ver kardex' },
                      ]}
                      onSelect={(key) =>
                        setModal({ kind: key === 'count' ? 'count' : 'kardex', product })
                      }
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
        const state = modal();
        switch (state.kind) {
          case 'none':
            return null;
          case 'entry':
            return (
              <EntryModal product={state.product} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />
            );
          case 'adjust':
            return (
              <AdjustmentModal product={state.product} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />
            );
          case 'count':
            return (
              <CountModal product={state.product} onDone={closeAndRefresh} onClose={() => setModal({ kind: 'none' })} />
            );
          case 'kardex':
            return (
              <KardexModal
                product={state.product}
                onClose={() => setModal({ kind: 'none' })}
                onGoToKardex={() => {
                  setModal({ kind: 'none' });
                  props.onGoToKardex();
                }}
              />
            );
        }
      })()}
    </section>
  );
};
