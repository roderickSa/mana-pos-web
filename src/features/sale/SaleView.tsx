import { createEffect, createResource, createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import { getProduct, getProductByBarcode, searchProducts } from '@/shared/api/products';
import {
  checkoutSale,
  checkoutSaleWithPayments,
  reprintTicket,
  type CheckoutResponseDto,
  type PaymentPart,
} from '@/shared/api/sales';
import { getExpiring } from '@/shared/api/inventory';
import { CHARGE_METHOD_TO_API } from '@/shared/lib/labels';
import { formatSoles } from '@/shared/lib/money';
import { beepError, beepOk, beepSuccess } from '@/shared/lib/sounds';
import { listenToScanner } from '@/shared/lib/scanner';
import { showNotice } from '@/shared/state/notices';
import { bumpCashRefresh } from '@/shared/state/cash-refresh';
import { cashStatus } from '@/shared/state/cash-status';
import type { ProductDto, TicketLine, UnitTicketLine, WeightProductDto, WeightTicketLine } from '@/shared/types';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { CategoryTabs } from './components/CategoryTabs';
import { ChargeModal } from './components/ChargeModal';
import { CreditChargeModal } from './components/CreditChargeModal';
import { DiscountModal, type DiscountTarget } from './components/DiscountModal';
import { CustomerPickModal } from './components/CustomerPickModal';
import { LineActionsModal } from './components/LineActionsModal';
import { QuantityModal } from './components/QuantityModal';
import { PriceCheckModal } from './components/PriceCheckModal';
import { ProductGrid } from './components/ProductGrid';
import { SearchBox } from './components/SearchBox';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { TicketPanel } from './components/TicketPanel';
import { WeightModal } from './components/WeightModal';
import {
  addUnitProduct,
  addWeightProduct,
  adjustSelectedQuantity,
  discountApprovalToken,
  moveSelection,
  removeLine,
  refreshTicketPrices,
  removeSelectedLine,
  setLineQuantity,
  setTicketCustomer,
  startNewTicket,
  ticketCustomer,
  ticketDiscountCents,
  ticketId,
  ticketLines,
  ticketTotalCents,
  undoRemoveLine,
  updateWeightLine,
} from './state/ticket';
import styles from './SaleView.module.css';

type ChargeMethod = 'Efectivo' | 'Yape' | 'Tarjeta';

const LEGEND_DISMISSED_KEY = 'mana-pos-leyenda-codigo-oculta';

export const SaleView: Component<{ onGoToCash: () => void }> = (props) => {
  const [query, setQuery] = createSignal('');
  const [category, setCategory] = createSignal<string | null>('__mostrador');
  const [payment, setPayment] = createSignal('Efectivo');
  const [weighing, setWeighing] = createSignal<WeightProductDto | null>(null);
  // Línea pesable en corrección: el mismo modal de balanza, pero reemplaza.
  const [reweighingLine, setReweighingLine] = createSignal<WeightTicketLine | null>(null);
  const [charging, setCharging] = createSignal<ChargeMethod | null>(null);
  const [creditCharging, setCreditCharging] = createSignal(false);
  const [discounting, setDiscounting] = createSignal<DiscountTarget | null>(null);
  const [lineActions, setLineActions] = createSignal<TicketLine | null>(null);
  const [quantityEditing, setQuantityEditing] = createSignal<UnitTicketLine | null>(null);
  const [cancelingSale, setCancelingSale] = createSignal(false);
  const [customerPicking, setCustomerPicking] = createSignal(false);
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [priceCheck, setPriceCheck] = createSignal(false);
  const [multiplier, setMultiplier] = createSignal(1);
  const [lastSale, setLastSale] = createSignal<{ id: string; number: number } | null>(null);
  const [legendDismissed, setLegendDismissed] = createSignal(
    localStorage.getItem(LEGEND_DISMISSED_KEY) === '1',
  );
  let searchInput: HTMLInputElement | undefined;

  // Al escribir se busca en TODO el catálogo: la pestaña activa solo filtra
  // cuando el buscador está vacío (si no, "queso" no aparece desde "Pan").
  // Las secciones muestran solo los 24 más vendidos: los tiles son para lo
  // frecuente; el resto se alcanza por búsqueda o escaneo.
  const TILES_PER_CATEGORY = 24;
  // Lo tecleado se busca 120 ms después de la última tecla, no por carácter;
  // el lector entra por Enter (submit) y no pasa por aquí.
  const [debouncedQuery, setDebouncedQuery] = createSignal('');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const value = query().trim();
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (value === '') {
      setDebouncedQuery('');
      return;
    }
    debounceTimer = setTimeout(() => setDebouncedQuery(value), 120);
  });
  onCleanup(() => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  });
  const [products, { refetch }] = createResource(
    () => ({ query: debouncedQuery(), category: category() }),
    async (params) => {
      if (params.query !== '') return searchProducts(params.query, null);
      if (params.category === '__mostrador') {
        return searchProducts('', null, false, true, null, TILES_PER_CATEGORY);
      }
      return searchProducts('', params.category, false, false, null, TILES_PER_CATEGORY);
    },
  );

  // La pantalla de venta se bloquea entera si la caja está cerrada (estado
  // compartido: un solo /cash/status para toda la app).
  const cashOpen = () => cashStatus()?.open;
  const sellingBlocked = () => cashOpen() === false;

  const modalOpen = () =>
    charging() !== null ||
    weighing() !== null ||
    reweighingLine() !== null ||
    creditCharging() ||
    discounting() !== null ||
    lineActions() !== null ||
    quantityEditing() !== null ||
    cancelingSale() ||
    customerPicking() ||
    helpOpen() ||
    priceCheck();

  const checkoutDiscounts = () => ({
    ticketDiscountCents: ticketDiscountCents(),
    approvalToken: discountApprovalToken(),
    customerId: ticketCustomer()?.id ?? null,
  });

  // Tras cada acción el buscador recupera el foco: escanear siempre funciona.
  function focusSearch(): void {
    setTimeout(() => searchInput?.focus(), 40);
  }

  // Lotes vencidos según Inventario: la grilla los marca y al agregar se
  // avisa (sin bloquear — puede ser el lote nuevo el que está adelante).
  const [expiring] = createResource(() => getExpiring().catch(() => null));
  const expiredIds = (): ReadonlySet<string> =>
    new Set(
      (expiring()?.items ?? [])
        .filter((item) => item.daysLeft < 0)
        .map((item) => item.productId),
    );

  function onProductTap(product: ProductDto): void {
    if (sellingBlocked()) {
      beepError();
      showNotice('La caja está cerrada. Ábrela para empezar a vender.');
      return;
    }
    if (expiredIds().has(product.id)) {
      showNotice(`⚠ ${product.name} tiene un lote VENCIDO según Inventario — revísalo antes de vender.`);
    }
    if (product.saleType === 'weight') {
      setMultiplier(1);
      setWeighing(product);
      return;
    }
    addUnitProduct(product, multiplier());
    setMultiplier(1);
    beepOk();
    focusSearch();
  }

  async function addByCode(text: string): Promise<void> {
    // 1-3 dígitos = código corto de mostrador: agrega directo.
    if (/^\d{1,3}$/.test(text)) {
      // El buscador se vacía ANTES de esperar: si el lector ya empezó el
      // siguiente código, no se le comen los primeros dígitos.
      setQuery('');
      const matches = await searchProducts(text, null);
      const byShortCode = matches.find((product) => product.shortCode === text);
      if (byShortCode === undefined) {
        beepError();
        showNotice(`Ningún producto tiene el código corto ${text}`);
        return;
      }
      onProductTap(byShortCode);
      return;
    }
    if (!/^\d{8,}$/.test(text)) return;
    setQuery('');
    const product = await getProductByBarcode(text);
    if (product === null) {
      beepError();
      showNotice(`El código ${text} no está registrado — créalo en Inventario`);
      return;
    }
    onProductTap(product);
  }

  async function onSearchSubmit(): Promise<void> {
    const text = query().trim();
    // Enter con el buscador vacío y ticket armado = ir directo al cobro.
    if (text === '') {
      openCharge();
      return;
    }
    // "3*" arma el multiplicador; "3*15" multiplica y agrega en un paso.
    const multOnly = /^(\d{1,2})\s*[*xX]$/.exec(text);
    if (multOnly?.[1] !== undefined) {
      setMultiplier(Math.max(1, Number(multOnly[1])));
      setQuery('');
      return;
    }
    const multCombo = /^(\d{1,2})[*xX](\d+)$/.exec(text);
    if (multCombo?.[1] !== undefined && multCombo[2] !== undefined) {
      setMultiplier(Math.max(1, Number(multCombo[1])));
      await addByCode(multCombo[2]);
      return;
    }
    await addByCode(text);
  }

  function onSaleCompleted(response: CheckoutResponseDto): void {
    startNewTicket();
    setLastSale({ id: response.id, number: response.number });
    void refetch();
    bumpCashRefresh();
    beepSuccess();
  }

  function onCheckoutError(cause: unknown): void {
    beepError();
    if (cause instanceof ApiError && cause.code === 'PAYMENTS_DO_NOT_MATCH_TOTAL') {
      showNotice('Los precios cambiaron. El ticket se actualizó: revisa el total y vuelve a cobrar.');
      void syncTicketWithCatalog();
      void refetch();
    } else if (cause instanceof ApiError && cause.code === 'PRODUCT_NOT_SELLABLE') {
      showNotice('Un producto del ticket ya no está disponible. Quítalo y vuelve a cobrar.');
    } else if (cause instanceof ApiError && cause.code === 'DISCOUNT_NEEDS_MANAGER') {
      showNotice('El descuento necesita el PIN del encargado — ábrelo desde el botón % del ticket.');
    } else if (cause instanceof ApiError && cause.serverMessage !== null) {
      showNotice(cause.serverMessage);
    } else {
      showNotice('No se pudo cobrar. Revisa que el sistema local esté activo.');
    }
  }

  async function confirmCharge(receivedCents: number | null): Promise<CheckoutResponseDto | null> {
    const method = charging();
    if (method === null) return null;
    try {
      const response = await checkoutSale(
        ticketId(),
        ticketLines(),
        CHARGE_METHOD_TO_API[method],
        ticketTotalCents(),
        receivedCents,
        null,
        checkoutDiscounts(),
      );
      onSaleCompleted(response);
      return response;
    } catch (cause) {
      onCheckoutError(cause);
      return null;
    }
  }

  async function confirmSplitCharge(payments: PaymentPart[]): Promise<CheckoutResponseDto | null> {
    try {
      const response = await checkoutSaleWithPayments(
        ticketId(),
        ticketLines(),
        payments,
        checkoutDiscounts(),
      );
      onSaleCompleted(response);
      return response;
    } catch (cause) {
      onCheckoutError(cause);
      return null;
    }
  }

  // Trae del servidor los productos del ticket: un precio cambiado o un
  // producto desactivado se resuelve antes del cobro, no en un rechazo.
  async function syncTicketWithCatalog(): Promise<boolean> {
    const ids = [...new Set(ticketLines().map((line) => line.product.id))];
    const fresh = await Promise.all(ids.map(async (id) => [id, await getProduct(id).catch(() => undefined)] as const));
    const known = new Map<string, ProductDto | null>();
    for (const [id, product] of fresh) if (product !== undefined) known.set(id, product);
    const result = refreshTicketPrices(known);
    if (result.unavailable.length > 0) {
      beepError();
      showNotice(`Ya no se vende: ${result.unavailable.join(', ')}. Quítalo del ticket para cobrar.`);
      return false;
    }
    if (result.changedLines > 0) {
      showNotice(
        `${result.changedLines === 1 ? 'Un precio cambió' : `${result.changedLines} precios cambiaron`} — el ticket ya está actualizado, revisa el total.`,
      );
    }
    return true;
  }

  function openCharge(): void {
    if (sellingBlocked() || ticketLines().length === 0) return;
    void openChargeSynced();
  }

  async function openChargeSynced(): Promise<void> {
    if (!(await syncTicketWithCatalog())) return;
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
        checkoutDiscounts(),
      );
      startNewTicket();
      setLastSale({ id: response.id, number: response.number });
      setCreditCharging(false);
      void refetch();
      bumpCashRefresh();
      beepSuccess();
      showNotice(`Venta #${response.number} fiada: ${formatSoles(response.totalCents)}`);
      focusSearch();
    } catch (cause) {
      setCreditCharging(false);
      beepError();
      if (cause instanceof ApiError && cause.serverMessage !== null) {
        showNotice(cause.serverMessage);
      } else {
        showNotice('No se pudo registrar el fiado. Intenta de nuevo.');
      }
    }
  }

  // Enter (sin foco en inputs) = cobro exacto en efectivo: un solo teclazo.

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'F1') {
      event.preventDefault();
      setHelpOpen((open) => !open);
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (event.key === 'F8') {
      event.preventDefault();
      setPriceCheck((open) => !open);
      return;
    }
    // Con un modal abierto, el teclado es del modal (Esc lo cierra allí).
    if (modalOpen()) return;
    // F9 quita la línea seleccionada; Supr solo cuando no se está escribiendo
    // (borrar una letra del buscador no puede quitar una línea).
    if (event.key === 'F9' || (event.key === 'Delete' && event.target === document.body)) {
      event.preventDefault();
      const removed = removeSelectedLine();
      if (removed !== null) showNotice(`Se quitó ${removed.product.name} — Ctrl+Z lo devuelve`);
      return;
    }
    // F5/F6/F7 eligen el método de pago sin soltar el teclado.
    if (event.key === 'F5' || event.key === 'F6' || event.key === 'F7') {
      event.preventDefault();
      setPayment(event.key === 'F5' ? 'Yape' : event.key === 'F6' ? 'Tarjeta' : 'Fiado');
      return;
    }
    if (event.key === 'F4') {
      event.preventDefault();
      openCharge();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const restored = undoRemoveLine();
      if (restored !== null) showNotice(`${restored.product.name} volvió al ticket`);
      return;
    }
    if (event.target !== document.body) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (event.key === '+' || event.key === '-') {
      event.preventDefault();
      adjustSelectedQuantity(event.key === '+' ? 1 : -1);
      return;
    }
    // Enter suelto abre el cobro para confirmarlo; nunca cobra directo.
    if (event.key === 'Enter') {
      event.preventDefault();
      openCharge();
      return;
    }
    // Teclear sin foco no se pierde: el carácter va directo al buscador,
    // así el lector de códigos funciona aunque nadie haya hecho clic.
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      /[\dA-Za-zÁÉÍÓÚáéíóúñÑ*.]/.test(event.key)
    ) {
      event.preventDefault();
      setQuery(query() + event.key);
      searchInput?.focus();
      const length = query().length;
      searchInput?.setSelectionRange(length, length);
    }
  }

  // Una ráfaga del lector llega aquí antes que a cualquier input o modal.
  function onScan(code: string): void {
    if (modalOpen()) {
      beepError();
      showNotice('Cierra la ventana abierta para escanear otro producto.');
      return;
    }
    void addByCode(code);
  }

  onMount(() => {
    document.addEventListener('keydown', onKeyDown);
    // Al entrar (o volver) al módulo, el buscador queda listo para escanear.
    focusSearch();
  });
  const stopScanner = listenToScanner(onScan);
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
    stopScanner();
  });

  // El buscador es el corazón de Vender: tras tocar CUALQUIER botón del
  // módulo (stepper, pestañas, en espera, método de pago…) el foco vuelve
  // ahí, así el siguiente escaneo nunca se pierde. Con un modal abierto no
  // se roba el foco (el modal maneja el suyo).
  function refocusAfterTap(event: MouseEvent): void {
    if (modalOpen()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button') !== null) {
      focusSearch();
    }
  }

  return (
    <main
      class={styles.cuerpo}
      classList={{ [styles.borroso]: sellingBlocked() }}
      onClick={refocusAfterTap}
    >
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
          multiplier={multiplier()}
          setRef={(element) => {
            searchInput = element;
          }}
        />
        <div classList={{ [styles.tabsBuscando]: query().trim() !== '' }}>
          <CategoryTabs
            selected={category()}
            onSelect={(selected) => {
              setCategory(selected);
              setQuery('');
            }}
          />
        </div>
        <ProductGrid
          products={products() ?? []}
          loading={products.loading}
          failed={products.error !== undefined}
          query={query()}
          expiredIds={expiredIds()}
          onTap={onProductTap}
        />
        {/* Leyenda de los badges numéricos: útil al empezar, descartable
            después (persistido — no vuelve a aparecer). */}
        <Show when={!legendDismissed()}>
          <p class={styles.leyendaAtajos}>
            <kbd>#12</kbd> = código corto: tecléalo y Enter para agregar sin buscar. Escanear
            siempre funciona, aunque el producto no esté a la vista.
            <button
              type="button"
              class={styles.leyendaCerrar}
              aria-label="Ocultar esta ayuda"
              title="Ocultar (no vuelve a aparecer)"
              onClick={() => {
                setLegendDismissed(true);
                localStorage.setItem(LEGEND_DISMISSED_KEY, '1');
              }}
            >
              ✕
            </button>
          </p>
        </Show>
      </section>

      <TicketPanel
        payment={payment()}
        onPayment={setPayment}
        onCharge={openCharge}
        onRemoved={focusSearch}
        lastSaleNumber={lastSale()?.number ?? null}
        onReprintLast={() => {
          const sale = lastSale();
          if (sale === null) return;
          void reprintTicket(sale.id)
            .then((result) => showNotice(result.message))
            .catch(() => showNotice('No se pudo reimprimir el voucher.'));
        }}
        onHelp={() => setHelpOpen(true)}
        onEditWeight={(line) => {
          if (line.kind === 'weight') setReweighingLine(line);
        }}
        onDiscountLine={(line) => setDiscounting({ kind: 'line', line })}
        onDiscountTicket={() => setDiscounting({ kind: 'ticket' })}
        onLineActions={(line) => setLineActions(line)}
        onCancelSale={() => setCancelingSale(true)}
        onCustomer={() => setCustomerPicking(true)}
      />

      <Show when={weighing()}>
        {(product) => (
          <WeightModal
            product={product()}
            onCancel={() => {
              setWeighing(null);
              focusSearch();
            }}
            onConfirm={(grams, source) => {
              addWeightProduct(product(), grams, source);
              setWeighing(null);
              beepOk();
              focusSearch();
            }}
          />
        )}
      </Show>

      <Show when={reweighingLine()}>
        {(line) => {
          const product = line().product;
          return product.saleType === 'weight' ? (
            <WeightModal
              product={product}
              onCancel={() => {
                setReweighingLine(null);
                focusSearch();
              }}
              onConfirm={(grams, source) => {
                updateWeightLine(line().lineId, grams, source);
                setReweighingLine(null);
                beepOk();
                focusSearch();
              }}
            />
          ) : null;
        }}
      </Show>

      <Show when={creditCharging()}>
        <CreditChargeModal
          totalCents={ticketTotalCents()}
          initialCustomerId={ticketCustomer()?.id ?? null}
          onConfirm={confirmCreditCharge}
          onClose={() => {
            setCreditCharging(false);
            focusSearch();
          }}
        />
      </Show>

      <Show when={charging()}>
        {(method) => (
          <ChargeModal
            method={method()}
            totalCents={ticketTotalCents()}
            onConfirm={confirmCharge}
            onConfirmSplit={confirmSplitCharge}
            onClose={() => {
              setCharging(null);
              focusSearch();
            }}
          />
        )}
      </Show>

      <Show when={lineActions()}>
        {(line) => (
          <LineActionsModal
            line={line()}
            onQuantity={() => {
              const current = line();
              if (current.kind === 'unit') setQuantityEditing(current);
              setLineActions(null);
            }}
            onWeight={() => {
              const current = line();
              if (current.kind === 'weight') setReweighingLine(current);
              setLineActions(null);
            }}
            onDiscount={() => {
              setDiscounting({ kind: 'line', line: line() });
              setLineActions(null);
            }}
            onRemove={() => {
              const removed = removeLine(line().lineId);
              setLineActions(null);
              if (removed !== null) {
                beepOk();
                showNotice(`Se quitó ${removed.product.name} — «Deshacer» lo devuelve`);
              }
              focusSearch();
            }}
            onClose={() => {
              setLineActions(null);
              focusSearch();
            }}
          />
        )}
      </Show>

      <Show when={quantityEditing()}>
        {(line) => (
          <QuantityModal
            line={line()}
            onConfirm={(quantity) => {
              setLineQuantity(line().lineId, quantity);
              setQuantityEditing(null);
              beepOk();
              focusSearch();
            }}
            onClose={() => {
              setQuantityEditing(null);
              focusSearch();
            }}
          />
        )}
      </Show>

      <Show when={customerPicking()}>
        <CustomerPickModal
          hasCustomer={ticketCustomer() !== null}
          onPick={(customer) => {
            setTicketCustomer(customer);
            setCustomerPicking(false);
            beepOk();
            showNotice(`Venta a nombre de ${customer.name}`);
            focusSearch();
          }}
          onClear={() => {
            setTicketCustomer(null);
            setCustomerPicking(false);
            focusSearch();
          }}
          onClose={() => {
            setCustomerPicking(false);
            focusSearch();
          }}
        />
      </Show>

      <Show when={cancelingSale()}>
        <ConfirmModal
          title="¿Cancelar la venta en curso?"
          confirmLabel="Sí, cancelar venta"
          onConfirm={() => {
            startNewTicket();
            setCancelingSale(false);
            beepOk();
            showNotice('Venta cancelada — el ticket quedó vacío.');
            focusSearch();
          }}
          onClose={() => {
            setCancelingSale(false);
            focusSearch();
          }}
        >
          <p>
            Se vacía el ticket actual (líneas y descuentos). Los tickets en espera no se tocan y
            no se registra ninguna venta.
          </p>
        </ConfirmModal>
      </Show>

      <Show when={discounting()}>
        {(target) => (
          <DiscountModal
            target={target()}
            onClose={() => {
              setDiscounting(null);
              focusSearch();
            }}
          />
        )}
      </Show>

      <Show when={priceCheck()}>
        <PriceCheckModal
          onClose={() => {
            setPriceCheck(false);
            focusSearch();
          }}
        />
      </Show>

      <Show when={helpOpen()}>
        <ShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
            focusSearch();
          }}
        />
      </Show>
    </main>
  );
};
