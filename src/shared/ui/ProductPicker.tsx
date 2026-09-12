import { createSignal, For, Show, type Component } from 'solid-js';

import { getProductByBarcode, searchProducts } from '@/shared/api/products';
import { beepError, beepOk } from '@/shared/lib/sounds';
import type { ProductDto } from '@/shared/types';
import forms from './forms.module.css';
import styles from './ProductPicker.module.css';

// Buscador de producto único para toda la app: se teclea el nombre (lista de
// resultados clickeable) o se escanea/teclea el código y Enter agrega directo
// (match exacto por código de barras o código corto, si no el primer
// resultado). Siempre limpia el input y devuelve el foco para el siguiente.
export const ProductPicker: Component<{
  placeholder: string;
  onPick: (product: ProductDto) => void;
  // Filtro adicional sobre los resultados (excluir ya elegidos, mismo tipo…).
  accept?: (product: ProductDto) => boolean;
  includeInactive?: boolean;
  disabled?: boolean;
  meta?: (product: ProductDto) => string;
}> = (props) => {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<ProductDto[]>([]);
  let inputRef: HTMLInputElement | undefined;

  const accepted = (items: ProductDto[]) =>
    props.accept === undefined ? items : items.filter((item) => props.accept?.(item) === true);

  async function fetchCandidates(text: string): Promise<ProductDto[]> {
    try {
      // Código de barras: resolución exacta (incluye alias) antes que el LIKE.
      if (/^\d{6,}$/.test(text)) {
        const byBarcode = await getProductByBarcode(text);
        if (byBarcode !== null) return accepted([byBarcode]);
      }
      return accepted(
        await searchProducts(
          text,
          null,
          props.includeInactive === true,
          false,
          null,
        ),
      );
    } catch {
      return [];
    }
  }

  // Solo la última búsqueda pinta resultados: una respuesta lenta de un
  // texto anterior no puede pisar a la actual (y agregar el producto errado).
  let searchSeq = 0;
  async function onInput(text: string): Promise<void> {
    setQuery(text);
    const seq = ++searchSeq;
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    const candidates = await fetchCandidates(text.trim());
    if (seq === searchSeq) setResults(candidates);
  }

  function pick(product: ProductDto): void {
    props.onPick(product);
    setQuery('');
    setResults([]);
    inputRef?.focus();
    beepOk();
  }

  async function pickFromQuery(): Promise<void> {
    const text = query().trim();
    if (text === '') return;
    const candidates = results().length > 0 ? results() : await fetchCandidates(text);
    const exact = candidates.find(
      (product) => product.barcode === text || product.shortCode === text,
    );
    const chosen = exact ?? candidates[0];
    if (chosen === undefined) {
      beepError();
      return;
    }
    pick(chosen);
  }

  return (
    <>
      <input
        ref={inputRef}
        class={forms.input}
        value={query()}
        disabled={props.disabled === true}
        onInput={(event) => void onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void pickFromQuery();
          }
        }}
        placeholder={props.placeholder}
      />
      <Show when={results().length > 0}>
        <div class={styles.resultados}>
          <For each={results()}>
            {(product) => (
              <button type="button" class={styles.resultado} onClick={() => pick(product)}>
                <span>
                  {product.name}
                  {product.active ? '' : ' (inactivo)'}
                </span>
                <Show when={props.meta}>
                  {(meta) => <span class={styles.meta}>{meta()(product)}</span>}
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
};
