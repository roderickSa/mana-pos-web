import { For, Show, type Component } from 'solid-js';

import { formatKg, formatSoles } from '@/shared/lib/money';
import { reservedQuantity } from '@/features/sale/state/ticket';
import type { ProductDto } from '@/shared/types';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import styles from './ProductGrid.module.css';

const CATEGORY_CLASS: Record<string, string> = {
  'frutas-verduras': styles.catFruta,
  abarrotes: styles.catAbarrote,
  bebidas: styles.catBebida,
  limpieza: styles.catLimpieza,
  pan: styles.catPan,
};

// La presentación al final del nombre («… 400 g», «… 1.5 L», «… x6») es lo
// que distingue productos hermanos: se separa como línea propia del tile
// para que el truncado a 2 líneas nunca se la coma.
const PRESENTACION = /\s+((?:\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|lt|ml|cc|oz|un|und|unid)\.?)|(?:x\s?\d+))$/i;

function splitPresentation(name: string): { base: string; pres: string | null } {
  const trimmed = name.trim();
  const match = PRESENTACION.exec(trimmed);
  const pres = match?.[1];
  if (match === null || pres === undefined || match.index === 0) {
    return { base: trimmed, pres: null };
  }
  return { base: trimmed.slice(0, match.index), pres };
}

const ProductCard: Component<{ product: ProductDto; onTap: (product: ProductDto) => void }> = (
  props,
) => {
  // Stock visible = stock del sistema menos lo que ya está en la cesta.
  const remaining = () => {
    const stock =
      props.product.saleType === 'unit' ? props.product.stockUnits : props.product.stockGrams;
    return stock - reservedQuantity(props.product.id);
  };
  const minimum = () =>
    props.product.saleType === 'unit'
      ? props.product.stockMinimum
      : props.product.stockMinimumGrams;
  const out = () => remaining() <= 0;
  const low = () => !out() && remaining() <= minimum();

  const remainingLabel = () => {
    if (out()) return 'Sin stock';
    return props.product.saleType === 'unit'
      ? `Quedan ${remaining()}`
      : `Queda ${formatKg(remaining())}`;
  };

  // Sin stock: el tile se apaga, pero escanear/teclear el código sigue
  // vendiendo (la venta nunca se bloquea por stock — el tile solo avisa).
  return (
    <button
      type="button"
      class={`${styles.card} ${CATEGORY_CLASS[props.product.category] ?? styles.catAbarrote}`}
      classList={{ [styles.cardBaja]: low(), [styles.cardAgotada]: out() }}
      disabled={out()}
      aria-disabled={out()}
      onClick={() => props.onTap(props.product)}
    >
      <span class={styles.filaAlta}>
        <span class={styles.thumb}>
          <Show
            when={props.product.imagePath}
            fallback={<CategoryIcon category={props.product.category} />}
          >
            {(imagePath) => <img src={imagePath()} alt="" loading="lazy" />}
          </Show>
        </span>
        <Show when={props.product.shortCode}>
          {(code) => (
            <kbd class={styles.codigoCorto} title={`Código corto: teclea ${code()} y Enter`}>
              {code()}
            </kbd>
          )}
        </Show>
      </span>
      <span class={styles.nombre}>{splitPresentation(props.product.name).base}</span>
      <Show when={splitPresentation(props.product.name).pres}>
        {(pres) => <span class={styles.pres}>{pres()}</span>}
      </Show>
      {/* Pie en dos filas: el precio nunca se parte; el detalle va debajo. */}
      <span class={styles.pie}>
        <span class={styles.precio}>
          {props.product.saleType === 'unit'
            ? formatSoles(props.product.priceCents)
            : formatSoles(props.product.pricePerKgCents)}
        </span>
        <span class={styles.pieDetalle}>
          <Show when={props.product.saleType === 'weight'}>
            <span class={styles.granel}>por kg</span>
          </Show>
          <span
            class={styles.stock}
            classList={{ [styles.stockBajo]: low(), [styles.stockCero]: out() }}
          >
            {remainingLabel()}
          </span>
        </span>
      </span>
    </button>
  );
};

export const ProductGrid: Component<{
  products: ProductDto[];
  loading: boolean;
  query: string;
  onTap: (product: ProductDto) => void;
}> = (props) => (
  <div class={styles.grilla}>
    <For each={props.products}>
      {(product) => <ProductCard product={product} onTap={props.onTap} />}
    </For>
    <Show when={!props.loading && props.products.length === 0}>
      <p class={styles.vacio}>
        <Show
          when={props.query.trim() !== ''}
          fallback="Aún no hay productos en esta categoría. Regístralos desde Inventario."
        >
          Nada coincide con «{props.query}». Prueba con otro nombre o revisa el código.
        </Show>
      </p>
    </Show>
  </div>
);
