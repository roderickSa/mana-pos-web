import { For, Show, type Component } from 'solid-js';

import { formatKgShort, formatSoles } from '@/shared/lib/money';
import { reservedQuantity } from '@/features/sale/state/ticket';
import { activeCategories } from '@/shared/state/categories';
import type { ProductDto } from '@/shared/types';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import styles from './ProductGrid.module.css';

// Fallback para categorías sin color elegido (creadas antes de la tarea 85).
const CATEGORY_CLASS: Record<string, string> = {
  'frutas-verduras': styles.catFruta,
  abarrotes: styles.catAbarrote,
  bebidas: styles.catBebida,
  limpieza: styles.catLimpieza,
  pan: styles.catPan,
};

// Apariencia configurada en Ajustes → Categorías (ícono + color por slug).
function categoryLook(slug: string): { icon: string | null; color: string | null } {
  const category = activeCategories().find((item) => item.slug === slug);
  return { icon: category?.icon ?? null, color: category?.color ?? null };
}

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

const ProductCard: Component<{
  product: ProductDto;
  expired: boolean;
  onTap: (product: ProductDto) => void;
}> = (
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
      : formatKgShort(remaining());
  };

  // Sin stock: el tile se apaga, pero escanear/teclear el código sigue
  // vendiendo (la venta nunca se bloquea por stock — el tile solo avisa).
  return (
    <button
      type="button"
      class={`${styles.card} ${
        categoryLook(props.product.category).color === null
          ? (CATEGORY_CLASS[props.product.category] ?? styles.catAbarrote)
          : ''
      }`}
      classList={{ [styles.cardBaja]: low(), [styles.cardAgotada]: out() }}
      style={
        categoryLook(props.product.category).color === null
          ? undefined
          : { '--cat': `var(--cat-${categoryLook(props.product.category).color})` }
      }
      disabled={out()}
      aria-disabled={out()}
      onClick={() => props.onTap(props.product)}
    >
      {/* Banda de imagen arriba, a todo el ancho: la foto es lo primero que
          se reconoce a 80 cm. El código corto vive en la esquina de la banda. */}
      <span class={styles.media} classList={{ [styles.mediaIcono]: !props.product.imagePath }}>
        <Show
          when={props.product.imagePath}
          fallback={
            <CategoryIcon
              category={props.product.category}
              icon={categoryLook(props.product.category).icon}
            />
          }
        >
          {(imagePath) => <img src={imagePath()} alt="" loading="lazy" />}
        </Show>
        <Show when={props.product.shortCode}>
          {(code) => (
            <kbd class={styles.codigoCorto} title={`Código corto: teclea ${code()} y Enter`}>
              #{code()}
            </kbd>
          )}
        </Show>
      </span>
      <span class={styles.nombre}>{splitPresentation(props.product.name).base}</span>
      {/* Siempre ocupa su renglón (vacío si no hay presentación): así el
          precio queda a la misma altura en todos los tiles. */}
      <span class={styles.pres}>{splitPresentation(props.product.name).pres ?? ''}</span>
      <span class={styles.pie}>
        <span class={styles.precio}>
          {props.product.saleType === 'unit'
            ? formatSoles(props.product.priceCents)
            : formatSoles(props.product.pricePerKgCents)}
          <Show when={props.product.saleType === 'weight'}>
            <span class={styles.porKg}>/kg</span>
          </Show>
        </span>
        <Show
          when={!out() && !props.expired}
          fallback={
            <span class={styles.vencido}>{out() ? 'Sin stock' : 'Vencido'}</span>
          }
        >
          <span class={styles.stock} classList={{ [styles.stockBajo]: low() }}>
            {remainingLabel()}
          </span>
        </Show>
      </span>
    </button>
  );
};

export const ProductGrid: Component<{
  products: ProductDto[];
  loading: boolean;
  // El catálogo no respondió: se dice, en vez de fingir una categoría vacía.
  failed: boolean;
  query: string;
  expiredIds: ReadonlySet<string>;
  onTap: (product: ProductDto) => void;
}> = (props) => (
  <div class={styles.grilla}>
    <For each={props.products}>
      {(product) => (
        <ProductCard
          product={product}
          expired={props.expiredIds.has(product.id)}
          onTap={props.onTap}
        />
      )}
    </For>
    <Show when={props.failed}>
      <p class={styles.vacio}>
        No se pudo cargar el catálogo. Revisa que el sistema local esté activo; el escaneo sigue
        funcionando.
      </p>
    </Show>
    <Show when={!props.loading && !props.failed && props.products.length === 0}>
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
