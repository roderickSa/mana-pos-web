import { createSignal, onMount, Show, type Component } from 'solid-js';

import { getProductByBarcode, searchProducts } from '@/shared/api/products';
import { formatSoles } from '@/shared/lib/money';
import { beepError, beepOk } from '@/shared/lib/sounds';
import type { ProductDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import styles from './PriceCheckModal.module.css';

// Consulta de precio: el cliente pregunta "¿cuánto está?", se escanea y se ve
// el precio en grande SIN tocar el ticket. Queda abierto para el siguiente.
export const PriceCheckModal: Component<{ onClose: () => void }> = (props) => {
  const [code, setCode] = createSignal('');
  const [found, setFound] = createSignal<ProductDto | null>(null);
  const [notFound, setNotFound] = createSignal('');
  let inputRef: HTMLInputElement | undefined;

  // autofocus no dispara en contenido montado dinámicamente: foco manual.
  onMount(() => setTimeout(() => inputRef?.focus(), 60));

  async function lookup(): Promise<void> {
    const text = code().trim();
    if (text === '') return;
    setCode('');
    let product: ProductDto | null = null;
    if (/^\d{1,3}$/.test(text)) {
      const matches = await searchProducts(text, null);
      product = matches.find((item) => item.shortCode === text) ?? null;
    } else if (/^\d{8,}$/.test(text)) {
      product = await getProductByBarcode(text);
    } else {
      const matches = await searchProducts(text, null);
      product = matches[0] ?? null;
    }
    if (product === null) {
      beepError();
      setFound(null);
      setNotFound(text);
      return;
    }
    beepOk();
    setNotFound('');
    setFound(product);
  }

  return (
    <Modal
      size="sm"
      title="Consulta de precio"
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cerrar
          </button>
        </div>
      }
    >
      <div class={styles.cuerpo}>
        <input
          ref={inputRef}
          class={styles.input}
          type="text"
          placeholder="Escanea o escribe el producto…"
          value={code()}
          onInput={(event) => setCode(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && void lookup()}
        />

        <Show when={found()}>
          {(product) => {
            // Narrowing sobre una constante: el accessor no discrimina la unión.
            const priceLabel = () => {
              const item = product();
              return item.saleType === 'unit'
                ? formatSoles(item.priceCents)
                : `${formatSoles(item.pricePerKgCents)} /kg`;
            };
            return (
              <div class={styles.resultado}>
                <span class={styles.nombre}>{product().name}</span>
                <span class={styles.precio}>{priceLabel()}</span>
              </div>
            );
          }}
        </Show>
        <Show when={notFound() !== ''}>
          <p class={styles.noEncontrado}>«{notFound()}» no está registrado.</p>
        </Show>
        <p class={styles.nota}>Solo consulta: no agrega nada al ticket. Esc para cerrar.</p>
      </div>
    </Modal>
  );
};
