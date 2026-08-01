import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { searchProducts } from '@/shared/api/products';
import { formatKg } from '@/shared/lib/money';
import { beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import type { ProductDto } from '@/shared/types';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { AdjustmentModal } from './AdjustmentModal';
import { CountModal } from './CountModal';
import { EntryModal } from './EntryModal';
import { KardexModal } from './KardexModal';
import styles from '@/shared/ui/tabla.module.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'entry' | 'adjust' | 'count' | 'kardex'; product: ProductDto };

export const AdjustmentsTab: Component = () => {
  const [query, setQuery] = createSignal('');
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  const [products, { refetch }] = createResource(
    () => query(),
    (search) => searchProducts(search, null),
  );

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
          class={styles.buscador}
          type="text"
          placeholder="Busca el producto a ajustar (nombre o código)…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
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
            <For each={products() ?? []}>
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
                  <td class={styles.acciones}>
                    <button type="button" onClick={() => setModal({ kind: 'entry', product })}>
                      Entrada
                    </button>
                    <button type="button" onClick={() => setModal({ kind: 'adjust', product })}>
                      Merma
                    </button>
                    <button type="button" onClick={() => setModal({ kind: 'count', product })}>
                      Conteo
                    </button>
                    <button type="button" onClick={() => setModal({ kind: 'kardex', product })}>
                      Kardex
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!products.loading && (products() ?? []).length === 0}>
          <p class={styles.vacio}>No hay productos que coincidan con la búsqueda.</p>
        </Show>
      </div>

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
            return <KardexModal product={state.product} onClose={() => setModal({ kind: 'none' })} />;
        }
      })()}
    </section>
  );
};
