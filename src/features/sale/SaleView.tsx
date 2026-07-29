import { createResource, createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import { getProductByBarcode, searchProducts } from '@/shared/api/products';
import { checkoutSale, reprintTicket, type CheckoutResponseDto, type PaymentMethod } from '@/shared/api/sales';
import { getCashStatus } from '@/shared/api/cash';
import { formatSoles } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import { bumpCashRefresh, cashRefreshVersion } from '@/shared/state/cash-refresh';
import { currentUserName } from '@/shared/state/session';
import type { ProductDto, WeightProductDto } from '@/shared/types';
import { CategoryTabs } from './components/CategoryTabs';
import { ChargeModal } from './components/ChargeModal';
import { CreditChargeModal } from './components/CreditChargeModal';
import { ProductGrid } from './components/ProductGrid';
import { SearchBox } from './components/SearchBox';
import { TicketPanel } from './components/TicketPanel';
import { WeightModal } from './components/WeightModal';
import {
  addUnitProduct,
  addWeightProduct,
  removeLastLine,
  startNewTicket,
  ticketId,
  ticketLines,
  ticketTotalCents,
} from './state/ticket';
import styles from './SaleView.module.css';

type ChargeMethod = 'Efectivo' | 'Yape' | 'Tarjeta';

const METHOD_MAP: Record<ChargeMethod, PaymentMethod> = {
  Efectivo: 'cash',
  Yape: 'yape',
  Tarjeta: 'card',
};

export const SaleView: Component<{ onGoToCash: () => void }> = (props) => {
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal<string | null>('__mostrador');
  const [payment, setPayment] = createSignal('Efectivo');
  const [weighing, setWeighing] = createSignal<WeightProductDto | null>(null);
  const [charging, setCharging] = createSignal<ChargeMethod | null>(null);
  const [creditCharging, setCreditCharging] = createSignal(false);
  const [lastSale, setLastSale] = createSignal<{ id: string; number: number } | null>(null);
  let searchInput: HTMLInputElement | undefined;

  const [products, { refetch }] = createResource(
    () => ({ query: query(), category: category() }),
    (params) =>
      params.category === '__mostrador'
        ? searchProducts(params.query, null, false, true)
        : searchProducts(params.query, params.category),
  );

  // La pantalla de venta se bloquea entera si la caja está cerrada.
  const [cashTick, setCashTick] = createSignal(0);
  const [cashOpen] = createResource(
    () => ({ tick: cashTick(), version: cashRefreshVersion() }),
    async () => {
      try {
        return (await getCashStatus()).open;
      } catch {
        return null;
      }
    },
  );
  const cashInterval = setInterval(() => setCashTick((value) => value + 1), 15_000);
  onCleanup(() => clearInterval(cashInterval));
  const sellingBlocked = () => cashOpen() === false;

  function onProductTap(product: ProductDto): void {
    if (sellingBlocked()) {
      showNotice('La caja está cerrada. Ábrela para empezar a vender.');
      return;
    }
    if (product.saleType === 'weight') {
      setWeighing(product);
      return;
    }
    addUnitProduct(product);
  }

  async function onSearchSubmit(): Promise<void> {
    const text = query().trim();
    // 1-3 dígitos = código corto de mostrador: agrega directo.
    if (/^\d{1,3}$/.test(text)) {
      const matches = await searchProducts(text, null);
      const byShortCode = matches.find((product) => product.shortCode === text);
      setQuery('');
      if (byShortCode === undefined) {
        showNotice(`Ningún producto tiene el código corto ${text}`);
        return;
      }
      onProductTap(byShortCode);
      return;
    }
    if (!/^\d{8,}$/.test(text)) return;
    const product = await getProductByBarcode(text);
    setQuery('');
    if (product === null) {
      showNotice(`El código ${text} no está registrado — créalo en Inventario`);
      return;
    }
    onProductTap(product);
  }

  async function confirmCharge(receivedCents: number | null): Promise<CheckoutResponseDto | null> {
    const method = charging();
    if (method === null) return null;
    try {
      const response = await checkoutSale(
        ticketId(),
        ticketLines(),
        METHOD_MAP[method],
        ticketTotalCents(),
        receivedCents,
        null,
        currentUserName(),
      );
      startNewTicket();
      setLastSale({ id: response.id, number: response.number });
      void refetch();
      bumpCashRefresh();
      return response;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PAYMENTS_DO_NOT_MATCH_TOTAL') {
        showNotice('Los precios cambiaron. Revisa el ticket y vuelve a cobrar.');
        void refetch();
      } else if (cause instanceof ApiError && cause.code === 'PRODUCT_NOT_SELLABLE') {
        showNotice('Un producto del ticket ya no está disponible. Quítalo y vuelve a cobrar.');
      } else if (cause instanceof ApiError && cause.serverMessage !== null) {
        showNotice(cause.serverMessage);
      } else {
        showNotice('No se pudo cobrar. Revisa que el sistema local esté activo.');
      }
      return null;
    }
  }

  function openCharge(): void {
    if (sellingBlocked() || ticketLines().length === 0) return;
    if (payment() === 'Fiado') {
      setCreditCharging(true);
      return;
    }
    if (payment() === 'Efectivo' || payment() === 'Yape' || payment() === 'Tarjeta') {
      setCharging(payment() === 'Efectivo' ? 'Efectivo' : payment() === 'Yape' ? 'Yape' : 'Tarjeta');
    }
  }

  async function confirmCreditCharge(customerId: string): Promise<void> {
    try {
      const response = await checkoutSale(
        ticketId(),
        ticketLines(),
        'credit',
        ticketTotalCents(),
        null,
        customerId,
        currentUserName(),
      );
      startNewTicket();
      setLastSale({ id: response.id, number: response.number });
      setCreditCharging(false);
      void refetch();
      bumpCashRefresh();
      showNotice(`Venta #${response.number} fiada: ${formatSoles(response.totalCents)}`);
    } catch (cause) {
      setCreditCharging(false);
      if (cause instanceof ApiError && cause.serverMessage !== null) {
        showNotice(cause.serverMessage);
      } else {
        showNotice('No se pudo registrar el fiado. Intenta de nuevo.');
      }
    }
  }

  // Enter (sin foco en inputs) = cobro exacto en efectivo: un solo teclazo.
  async function chargeExactCash(): Promise<void> {
    if (sellingBlocked() || ticketLines().length === 0 || charging() !== null || weighing() !== null) return;
    setCharging('Efectivo');
    const response = await confirmCharge(null);
    setCharging(null);
    if (response !== null) {
      const warning = response.printerWarning === null ? '' : ` · ${response.printerWarning}`;
      showNotice(`Venta #${response.number} cobrada: ${formatSoles(response.totalCents)}${warning}`);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (event.key === 'F9') {
      event.preventDefault();
      removeLastLine();
      return;
    }
    if (event.key === 'F4') {
      event.preventDefault();
      openCharge();
      return;
    }
    if (event.key === 'Enter' && event.target === document.body) {
      event.preventDefault();
      void chargeExactCash();
    }
  }

  onMount(() => document.addEventListener('keydown', onKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  return (
    <main class={styles.cuerpo} classList={{ [styles.borroso]: sellingBlocked() }}>
      <Show when={sellingBlocked()}>
        <div class={styles.bloqueo}>
          <div class={styles.bloqueoCard}>
            <h2>La caja está cerrada</h2>
            <p>Abre la caja con su fondo inicial para empezar a vender.</p>
            <button type="button" onClick={props.onGoToCash}>
              Ir a abrir la caja
            </button>
          </div>
        </div>
      </Show>
      <section class={styles.catalogo}>
        <SearchBox
          value={query()}
          onInput={setQuery}
          onSubmit={onSearchSubmit}
          setRef={(element) => {
            searchInput = element;
          }}
        />
        <CategoryTabs selected={category()} onSelect={setCategory} />
        <ProductGrid
          products={products() ?? []}
          loading={products.loading}
          query={query()}
          onTap={onProductTap}
        />
      </section>

      <TicketPanel
        payment={payment()}
        onPayment={setPayment}
        onCharge={openCharge}
        lastSaleNumber={lastSale()?.number ?? null}
        onReprintLast={() => {
          const sale = lastSale();
          if (sale === null) return;
          void reprintTicket(sale.id)
            .then((result) => showNotice(result.message))
            .catch(() => showNotice('No se pudo reimprimir el voucher.'));
        }}
      />

      <Show when={weighing()}>
        {(product) => (
          <WeightModal
            product={product()}
            onCancel={() => setWeighing(null)}
            onConfirm={(grams, source) => {
              addWeightProduct(product(), grams, source);
              setWeighing(null);
            }}
          />
        )}
      </Show>

      <Show when={creditCharging()}>
        <CreditChargeModal
          totalCents={ticketTotalCents()}
          onConfirm={confirmCreditCharge}
          onClose={() => setCreditCharging(false)}
        />
      </Show>

      <Show when={charging()}>
        {(method) => (
          <ChargeModal
            method={method()}
            totalCents={ticketTotalCents()}
            onConfirm={confirmCharge}
            onClose={() => setCharging(null)}
          />
        )}
      </Show>
    </main>
  );
};
