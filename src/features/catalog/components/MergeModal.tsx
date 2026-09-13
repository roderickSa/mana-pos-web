import { createSignal, Show, type Component } from 'solid-js';

import { mergeProducts } from '@/shared/api/products';
import { ProductPicker } from '@/shared/ui/ProductPicker';
import { apiErrorMessage } from '@/shared/api/client';
import { formatKg } from '@/shared/lib/money';
import { beepError } from '@/shared/lib/sounds';
import type { ProductDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from '@/shared/ui/forms.module.css';

function stockLabel(product: ProductDto): string {
  return product.saleType === 'unit' ? `${product.stockUnits} und` : formatKg(product.stockGrams);
}

// Fusión de duplicados: el producto desde el que se abre es el MAESTRO; se
// busca el duplicado, se muestran las consecuencias y se confirma en rojo.
export const MergeModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [duplicate, setDuplicate] = createSignal<ProductDto | null>(null);
  const [error, setError] = createSignal('');
  const [merging, setMerging] = createSignal(false);

  async function confirmMerge(): Promise<void> {
    const loser = duplicate();
    if (loser === null || merging()) return;
    setMerging(true);
    setError('');
    try {
      const winner = await mergeProducts(props.product.id, loser.id);
      props.onDone(
        `«${loser.name}» se fusionó dentro de «${winner.name}» — stock final ${stockLabel(winner)}`,
      );
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo fusionar. Intenta de nuevo.'));
      setMerging(false);
    }
  }

  return (
    <Modal
      size="md"
      title={`Fusionar duplicado — ${props.product.name}`}
      onClose={props.onClose}
      footer={
        <Show
          when={duplicate() !== null}
          fallback={
            <div class={styles.acciones}>
              <button type="button" class={styles.secundario} onClick={props.onClose}>
                Cancelar
              </button>
            </div>
          }
        >
          <div class={styles.acciones}>
            <button type="button" class={styles.secundario} onClick={() => setDuplicate(null)}>
              Elegir otro
            </button>
            <button
              type="button"
              class={styles.primario}
              style={{ background: 'var(--peligro)' }}
              disabled={merging()}
              onClick={() => void confirmMerge()}
            >
              Fusionar productos
            </button>
          </div>
        </Show>
      }
    >
      <div class={styles.form}>
        <p class={styles.nota}>
          Este producto queda como <b>maestro</b>. Busca el duplicado que quieres absorber: su
          stock se suma, su historial (kardex, ventas, órdenes) pasa al maestro, sus códigos de
          barras quedan como alias (escanear cualquiera sigue vendiendo) y el duplicado se elimina.
        </p>

        <Show
          when={duplicate()}
          fallback={
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Buscar el duplicado (nombre o código y Enter)</span>
              <ProductPicker
                placeholder="p. ej. Inca Kola, o escanea el código"
                includeInactive
                accept={(item) =>
                  item.id !== props.product.id && item.saleType === props.product.saleType
                }
                meta={(item) => `${item.barcode ?? 'sin código'} · ${stockLabel(item)}`}
                onPick={setDuplicate}
              />
            </div>
          }
        >
          {(loser) => (
            <>
              <p>
                Se eliminará <b>«{loser().name}»</b> ({loser().barcode ?? 'sin código'} ·{' '}
                {stockLabel(loser())}) y todo pasará a <b>«{props.product.name}»</b>. Esta acción
                no se puede deshacer.
              </p>
            </>
          )}
        </Show>

        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};
