import { createSignal, Show, type Component } from 'solid-js';

import { updateProduct } from '@/shared/api/products';
import { formatSoles } from '@/shared/lib/money';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import type { ProductDto } from '@/shared/types';
import { costOf, priceOf } from './product-units';
import styles from '@/shared/ui/forms.module.css';

export const PriceModal: Component<{
  product: ProductDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [price, setPrice] = createSignal((priceOf(props.product) / 100).toFixed(2));
  const [error, setError] = createSignal('');

  const newPriceCents = () => Math.round(Number.parseFloat(price()) * 100);
  const valid = () => !Number.isNaN(newPriceCents()) && newPriceCents() > 0;
  const newMargin = () => {
    if (!valid()) return null;
    const margin = newPriceCents() - costOf(props.product);
    const pct = Math.round((margin / newPriceCents()) * 100);
    return `${formatSoles(margin)} · ${pct}%`;
  };

  async function save(): Promise<void> {
    if (!valid()) return;
    try {
      await updateProduct(props.product.id, {
        barcode: props.product.barcode,
        shortCode: props.product.shortCode,
        name: props.product.name,
        category: props.product.category,
        supplierIds: props.product.supplierIds,
        priceCents: newPriceCents(),
        costCents: costOf(props.product),
        packSize: props.product.saleType === 'unit' ? props.product.packSize : null,
        packCostCents: props.product.saleType === 'unit' ? props.product.packCostCents : null,
        stockMinimum:
          props.product.saleType === 'unit'
            ? props.product.stockMinimum
            : props.product.stockMinimumGrams,
        active: props.product.active,
        quickAccess: props.product.quickAccess,
      });
      props.onDone(`Precio de «${props.product.name}» actualizado a ${formatSoles(newPriceCents())}`);
    } catch {
      beepError();
      setError('No se pudo actualizar el precio.');
    }
  }

  return (
    <Modal title={`Actualizar precio — ${props.product.name}`} onClose={props.onClose}>
      <div class={styles.form}>
        <p class={styles.nota}>
          Precio actual: <b>{formatSoles(priceOf(props.product))}</b>
          {props.product.saleType === 'weight' ? ' por kg' : ''} · costo{' '}
          {formatSoles(costOf(props.product))}
        </p>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>
            Nuevo precio S/ {props.product.saleType === 'weight' ? 'por kg' : ''}
          </span>
          <input
            class={styles.input}
            type="number"
            step="0.10"
            min="0"
            value={price()}
            onInput={(event) => setPrice(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && save()}
            autofocus
          />
        </div>
        <Show when={newMargin() !== null}>
          <p class={styles.nota}>Margen resultante: {newMargin()}</p>
        </Show>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>
        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={styles.primario} disabled={!valid()} onClick={save}>
            Actualizar precio
          </button>
        </div>
      </div>
    </Modal>
  );
};
