import {
  createEffect,
  createResource,
  createSignal,
  For,
  Index,
  on,
  onCleanup,
  Show,
  type Component,
} from 'solid-js';
import { useNavigate } from '@solidjs/router';

import {
  confirmPurchaseOrder,
  createPurchaseOrder,
  discardDraftOrder,
  editPurchaseOrder,
  getPurchaseOrder,
  supplierPurchaseContext,
  type CreateOrderLinePayload,
  type PurchaseOrderDto,
  type SupplierContextDto,
} from '@/shared/api/purchases';
import { DateField } from '@/shared/ui/DateField';
import {
  getProduct,
  linkProductSupplier,
  listProductSupplies,
  supplierProducts,
  type ProductSupplyDto,
} from '@/shared/api/products';
import { listSuppliers } from '@/shared/api/suppliers';
import {centsToSolesInput, formatSoles, solesInputToCents } from '@/shared/lib/money';
import {beepError, beepOk, beepSuccess } from '@/shared/lib/sounds';
import {showNotice } from '@/shared/state/notices';
import type {ProductDto } from '@/shared/types';
import {ProductPicker } from '@/shared/ui/ProductPicker';
import {Modal } from '@/shared/ui/Modal';
import formStyles from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import styles from '../PurchasesView.module.css';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { currentUser } from '@/shared/state/session';
import { readStored, removeStored, writeStored } from '@/shared/lib/storage';
import {type DraftLine, packSizeOf, quantityUnits, unitCostCents, lineTotalCents } from './purchase-lines';
import {
  decodeOrderDraft,
  deliveryDay,
  encodeOrderDraft,
  isEmptyOrderDraft,
  restoreLines,
  storedLines,
  type OrderDraftSnapshot,
} from './order-draft';

const GUARDADO_LOCAL_MS = 300;

// `draftId` llega solo desde `/compras/ordenes/<id>/editar`: en `/nueva` la
// orden todavía no existe en el servidor.
export const OrderDraftForm: Component<{
  draftId?: string;
  onDone: () => void;
  onCancel: () => void;
}> = (props) => {
  const navigate = useNavigate();
  const [suppliers] = createResource(listSuppliers);
  const [supplierId, setSupplierId] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [lines, setLines] = createSignal<DraftLine[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [suggesting, setSuggesting] = createSignal(false);
  const [toAssociate, setToAssociate] = createSignal<ProductDto | null>(null);
  const [expectedAt, setExpectedAt] = createSignal('');
  const [context, setContext] = createSignal<SupplierContextDto | null>(null);
  // Proveedor, fecha y notas se ponen una vez; después estorban. Se pliegan
  // solos al agregar el primer producto y se abren con un clic.
  const [datosAbiertos, setDatosAbiertos] = createSignal(true);
  // Condiciones de ESTE proveedor por producto, cacheadas a medida que se usan.
  const [supplies, setSupplies] = createSignal<Record<string, ProductSupplyDto | null>>({});

  // --- El borrador, solo en este navegador --------------------------------
  //
  // Armar una orden lleva media hora y no se puede perder por una recarga.
  // Pero tampoco hace falta que viva en la base: hasta que alguien la crea,
  // esta orden no le importa a nadie más. Guardarla en el servidor mientras se
  // tecleaba traía una cola de borradores que nadie podía limpiar, punteros a
  // órdenes borradas y guardados a destiempo. Se queda acá, y se tira con un
  // botón.
  const [numeroOrden, setNumeroOrden] = createSignal(0);
  const [restaurando, setRestaurando] = createSignal(true);
  const [cambiandoProveedor, setCambiandoProveedor] = createSignal('');
  const [confirmandoCancelar, setConfirmandoCancelar] = createSignal(false);
  const claveLocal = (): `mana-pos:borrador-orden:${string}` =>
    `mana-pos:borrador-orden:${currentUser()?.id ?? 'anonimo'}`;

  const snapshot = (): OrderDraftSnapshot => ({
    supplierId: supplierId(),
    notes: notes(),
    expectedAt: expectedAt(),
    headerOpen: datosAbiertos(),
    lines: storedLines(lines()),
  });

  // Solo las líneas completas viajan al crear la orden: el API exige cantidad
  // y costo positivos, y un renglón recién agregado todavía no los tiene.
  const lineaCompleta = (line: DraftLine): boolean =>
    quantityUnits(line) > 0 && unitCostCents(line) !== null;

  function lineasParaServidor(): CreateOrderLinePayload[] {
    return lines()
      .filter(lineaCompleta)
      .map((line) => {
        const packSize = packSizeOf(line);
        return {
          productId: line.product.id,
          quantity: quantityUnits(line),
          unitCostCents: unitCostCents(line) ?? 0,
          packSize,
          packCostCents: packSize === null ? null : solesInputToCents(line.cost),
        };
      });
  }

  let timerLocal: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const actual = snapshot();
    if (restaurando()) return;
    // Editando un borrador que YA está en la base, el apunte local sobra: esa
    // orden vive allá. Si se escribiera igual, la próxima «Nueva orden»
    // arrancaría con una copia y habría dos borradores de lo mismo.
    if (props.draftId !== undefined) return;
    if (timerLocal !== undefined) clearTimeout(timerLocal);
    timerLocal = setTimeout(() => {
      timerLocal = undefined;
      if (isEmptyOrderDraft(actual)) removeStored(claveLocal());
      else writeStored(claveLocal(), encodeOrderDraft(actual));
    }, GUARDADO_LOCAL_MS);
  });

  function olvidarLocal(): void {
    if (timerLocal !== undefined) clearTimeout(timerLocal);
    timerLocal = undefined;
    removeStored(claveLocal());
  }

  onCleanup(() => {
    if (timerLocal !== undefined) clearTimeout(timerLocal);
  });

  const hayAlgoTecleado = (): boolean => !isEmptyOrderDraft(snapshot());

  // --- Volver a lo que había ---------------------------------------------

  // Los productos de las líneas guardadas: primero los de este proveedor en
  // una sola llamada, y uno por uno solo los que falten.
  async function productosDe(ids: readonly string[], proveedor: string): Promise<Map<string, ProductDto>> {
    const porId = new Map<string, ProductDto>();
    if (ids.length === 0) return porId;
    try {
      for (const product of await supplierProducts(proveedor)) {
        porId.set(product.id, product);
      }
    } catch {
      // Sin la lista del proveedor se piden uno por uno, más abajo.
    }
    for (const id of ids) {
      if (porId.has(id)) continue;
      try {
        const product = await getProduct(id);
        if (product !== null) porId.set(id, product);
      } catch {
        // Producto que ya no está: la línea se cae y se avisa.
      }
    }
    return porId;
  }

  function avisarFaltantes(missing: number): void {
    if (missing === 0) return;
    showNotice(
      missing === 1
        ? 'Un producto del borrador ya no está y se quitó de la orden'
        : `${missing} productos del borrador ya no están y se quitaron de la orden`,
    );
  }

  // Una orden guardada vuelve del servidor: sus cantidades están en unidades
  // o gramos y acá se teclean en cajas o kilos.
  async function restaurarDesdeOrden(order: PurchaseOrderDto): Promise<void> {
    const porId = await productosDe(
      order.lines.map((line) => line.productId),
      order.supplierId,
    );
    const nuevas: DraftLine[] = [];
    let missing = 0;
    for (const linea of order.lines) {
      const product = porId.get(linea.productId);
      if (product === undefined) {
        missing += 1;
        continue;
      }
      const packSize = product.saleType === 'unit' ? linea.packSize : null;
      const cantidad =
        packSize !== null
          ? String(Math.max(1, Math.round(linea.quantityOrdered / packSize)))
          : product.saleType === 'weight'
            ? String(linea.quantityOrdered / 1000)
            : String(linea.quantityOrdered);
      const costo = packSize !== null ? linea.packCostCents : linea.unitCostCents;
      nuevas.push({
        product,
        quantity: cantidad,
        cost: costo === null || costo <= 0 ? '' : centsToSolesInput(costo),
        packSize,
      });
    }
    setSupplierId(order.supplierId);
    setNotes(order.notes ?? '');
    setExpectedAt(deliveryDay(order.expectedAt));
    setLines(nuevas);
    setDatosAbiertos(nuevas.length === 0);
    setNumeroOrden(order.number);
    void loadContext(order.supplierId);
    for (const linea of nuevas) void loadSupply(linea.product.id);
    avisarFaltantes(missing);
  }

  async function restaurarDesdeLocal(guardadoLocal: OrderDraftSnapshot): Promise<void> {
    setSupplierId(guardadoLocal.supplierId);
    setNotes(guardadoLocal.notes);
    setExpectedAt(guardadoLocal.expectedAt);
    setDatosAbiertos(guardadoLocal.headerOpen);
    const porId = await productosDe(
      guardadoLocal.lines.map((line) => line.productId),
      guardadoLocal.supplierId,
    );
    const { lines: nuevas, missing } = restoreLines(guardadoLocal.lines, porId);
    setLines(nuevas);
    if (guardadoLocal.supplierId !== '') void loadContext(guardadoLocal.supplierId);
    for (const linea of nuevas) void loadSupply(linea.product.id);
    avisarFaltantes(missing);
  }

  // `/compras/ordenes/<id>/editar` abre un borrador que YA está en el
  // servidor (de una versión anterior, o de un seed). Los nuevos ya no se
  // guardan ahí: se arman en esta pantalla y se crean de una.
  async function borradorVigente(id: string): Promise<PurchaseOrderDto | undefined> {
    try {
      const order = await getPurchaseOrder(id);
      return order.status === 'draft' ? order : undefined;
    } catch {
      return undefined;
    }
  }

  async function arrancar(): Promise<void> {
    const id = props.draftId;
    if (id !== undefined) {
      const order = await borradorVigente(id);
      if (order === undefined) {
        showNotice('Ese borrador ya no está — podés armar la orden de nuevo');
        navigate('/compras/ordenes/nueva', { replace: true });
        return;
      }
      await restaurarDesdeOrden(order);
      return;
    }
    const guardadoLocal = readStored(claveLocal(), decodeOrderDraft);
    if (guardadoLocal === undefined) return;
    await restaurarDesdeLocal(guardadoLocal);
  }

  void arrancar().finally(() => setRestaurando(false));

  // Pasar de `/nueva` a un borrador del servidor (o de uno a otro) NO vuelve a
  // montar el formulario: hay que traer la orden a mano.
  createEffect(
    on(
      () => props.draftId,
      (id, anterior) => {
        if (id === anterior || id === undefined) return;
        setRestaurando(true);
        void arrancar().finally(() => setRestaurando(false));
      },
      { defer: true },
    ),
  );

  const supplyOf = (productId: string): ProductSupplyDto | null =>
    supplies()[productId] ?? null;

  async function loadContext(id: string): Promise<void> {
    if (id === '') {
      setContext(null);
      return;
    }
    try {
      setContext(await supplierPurchaseContext(id));
    } catch {
      setContext(null);
    }
  }

  // Traer lo último que se le pidió: casi siempre se le pide lo mismo.
  async function copyLastOrder(): Promise<void> {
    const last = context()?.lastOrder;
    if (last === null || last === undefined) return;
    const productos = await supplierProducts(supplierId());
    const porId = new Map(productos.map((item) => [item.id, item]));
    const nuevas: DraftLine[] = [];
    for (const linea of last.lines) {
      const product = porId.get(linea.productId);
      if (product === undefined) continue;
      await loadSupply(product.id);
      const packSize = product.saleType === 'unit' ? (supplyOf(product.id)?.packSize ?? null) : null;
      const cantidad =
        packSize !== null
          ? String(Math.max(1, Math.round(linea.quantityOrdered / packSize)))
          : product.saleType === 'weight'
            ? String(linea.quantityOrdered / 1000)
            : String(linea.quantityOrdered);
      const costo = packSize !== null ? linea.packCostCents : linea.unitCostCents;
      nuevas.push({
        product,
        quantity: cantidad,
        cost: costo === null || costo <= 0 ? '' : centsToSolesInput(costo),
        packSize,
      });
    }
    if (nuevas.length === 0) {
      showNotice('Los productos de esa orden ya no están disponibles.');
      return;
    }
    setLines(nuevas);
    beepOk();
    showNotice(`${nuevas.length} líneas traídas de la orden #${last.number} — revisa los costos`);
  }

  async function loadSupply(productId: string): Promise<void> {
    if (productId in supplies()) return;
    try {
      const all = await listProductSupplies(productId);
      const mine = all.find((item) => item.supplierId === supplierId()) ?? null;
      setSupplies({ ...supplies(), [productId]: mine });
    } catch {
      setSupplies({ ...supplies(), [productId]: null });
    }
  }

  // Reposición sugerida: llegar a 2× el mínimo. En cajas si se compra por
  // caja; en kilos con un decimal para pesables.
  function suggestedQuantity(product: ProductDto, packSize: number | null): string {
    if (product.saleType === 'weight') {
      const neededGrams = Math.max(product.stockMinimumGrams * 2 - product.stockGrams, 500);
      return String(Math.ceil(neededGrams / 100) / 10);
    }
    const needed = Math.max(product.stockMinimum * 2 - product.stockUnits, 1);
    if (packSize !== null) return String(Math.max(1, Math.ceil(needed / packSize)));
    return String(needed);
  }

  // El botón que evita armar la orden de memoria: precarga lo que este
  // proveedor surte y está bajo mínimo, con cantidad sugerida editable.
  async function suggestLowStock(): Promise<void> {
    if (supplierId() === '' || suggesting()) return;
    setSuggesting(true);
    try {
      // El filtro de bajo mínimo lo hace el servidor sobre todo el catálogo
      // del proveedor; acá solo se descarta lo que ya está en la orden.
      const low = await supplierProducts(supplierId(), { onlyLowStock: true });
      const fresh = low.filter(
        (product) => !lines().some((line) => line.product.id === product.id),
      );
      if (fresh.length === 0) {
        showNotice(
          low.length === 0
            ? 'Este proveedor no tiene productos bajo mínimo.'
            : 'Los productos bajo mínimo ya están en la orden.',
        );
        return;
      }
      await Promise.all(fresh.map((product) => loadSupply(product.id)));
      for (const product of fresh) {
        const supply = supplyOf(product.id);
        const packSize = product.saleType === 'unit' ? (supply?.packSize ?? null) : null;
        addProduct(product, suggestedQuantity(product, packSize));
      }
      beepOk();
      showNotice(`${fresh.length} productos bajo mínimo agregados — revisa las cantidades`);
    } catch {
      beepError();
      showNotice('No se pudieron cargar los productos bajo mínimo.');
    } finally {
      setSuggesting(false);
    }
  }

  // El picker muestra TODO el catálogo: si el producto no está asociado al
  // proveedor, se ofrece asociarlo al vuelo (antes el formulario nacía vacío).
  async function pickProduct(product: ProductDto): Promise<void> {
    if (supplierId() === '') return;
    if (product.supplierIds.includes(supplierId())) {
      await loadSupply(product.id);
      addProduct(product);
      return;
    }
    setToAssociate(product);
  }

  async function associateAndAdd(): Promise<void> {
    const product = toAssociate();
    if (product === null) return;
    try {
      await linkProductSupplier(product.id, supplierId());
      await loadSupply(product.id);
      addProduct(product);
      beepOk();
      showNotice(`«${product.name}» quedó asociado a este proveedor`);
    } catch {
      beepError();
      showNotice('No se pudo asociar el producto.');
    }
    setToAssociate(null);
  }

  // El costo y el empaque salen de las condiciones de ESTE proveedor. El
  // producto solo guarda el costo de la última compra, que puede ser de otro.
  function addProduct(product: ProductDto, quantity = ''): void {
    setDatosAbiertos(false);
    const supply = supplyOf(product.id);
    const packSize = product.saleType === 'unit' ? (supply?.packSize ?? null) : null;
    const suggested =
      product.saleType === 'weight'
        ? (supply?.unitCostCents ?? product.costPerKgCents)
        : packSize !== null
          ? (supply?.packCostCents ?? null)
          : (supply?.unitCostCents ?? product.costCents);
    setLines([
      ...lines(),
      {
        product,
        quantity: quantity === '' ? '' : quantity,
        cost: suggested === null || suggested <= 0 ? '' : centsToSolesInput(suggested),
        packSize,
      },
    ]);
  }

  function updateLine(productId: string, patch: Partial<DraftLine>): void {
    setLines(lines().map((line) => (line.product.id === productId ? { ...line, ...patch } : line)));
  }

  function removeLine(productId: string): void {
    setLines(lines().filter((line) => line.product.id !== productId));
  }

  const totalCents = () => lines().reduce((sum, line) => sum + lineTotalCents(line), 0);
  const valid = () =>
    supplierId() !== '' &&
    lines().length > 0 &&
    lines().every((line) => quantityUnits(line) > 0 && unitCostCents(line) !== null);

  function quantityLabel(line: DraftLine): string {
    if (packSizeOf(line) !== null) return 'Cajas';
    return line.product.saleType === 'weight' ? 'Kilos' : 'Unidades';
  }

  function costLabel(line: DraftLine): string {
    if (packSizeOf(line) !== null) return 'Costo/caja S/';
    return line.product.saleType === 'weight' ? 'Costo/kg S/' : 'Costo/u S/';
  }

  function lineHint(line: DraftLine): string {
    const packSize = packSizeOf(line);
    const units = quantityUnits(line);
    const cost = unitCostCents(line);
    if (packSize !== null && units > 0) {
      return `= ${units} unidades${cost === null ? '' : ` a ${formatSoles(cost)} c/u`}`;
    }
    return '';
  }

  // Aviso de costo: si lo pactado está por encima de lo que este proveedor
  // cobraba, conviene verlo ANTES de mandar la orden.
  function costChange(line: DraftLine): { pct: number; before: number } | null {
    const before = supplyOf(line.product.id)?.unitCostCents ?? null;
    const now = unitCostCents(line);
    if (before === null || before <= 0 || now === null) return null;
    const pct = Math.round(((now - before) / before) * 100);
    return pct === 0 ? null : { pct, before };
  }

  // Guardar como borrador: la orden queda en el listado, editable, sin salir
  // al proveedor. Es explícito, a pedido. Lo que se hacía antes —crearla sola
  // mientras se tecleaba— llenaba el listado de borradores que nadie pidió.
  async function guardarBorrador(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    setError('');
    try {
      const id = props.draftId;
      if (id === undefined) {
        await createPurchaseOrder(
          supplierId(),
          notes().trim() === '' ? null : notes().trim(),
          expectedAt().trim() === '' ? null : expectedAt(),
          true,
          lineasParaServidor(),
        );
      } else {
        await editPurchaseOrder(
          id,
          notes().trim() === '' ? null : notes().trim(),
          expectedAt().trim() === '' ? null : expectedAt(),
          lineasParaServidor(),
        );
      }
      olvidarLocal();
      beepOk();
      showNotice('Borrador guardado — lo terminás cuando quieras');
      props.onDone();
    } catch {
      beepError();
      setError('No se pudo guardar el borrador. Revisa las líneas.');
      setSaving(false);
    }
  }

  // «Crear orden» crea la orden de una. Sobre un borrador que ya estaba en el
  // servidor (de antes), lo actualiza y lo confirma.
  async function confirmar(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    setError('');
    try {
      const id = props.draftId;
      if (id === undefined) {
        await createPurchaseOrder(
          supplierId(),
          notes().trim() === '' ? null : notes().trim(),
          expectedAt().trim() === '' ? null : expectedAt(),
          false,
          lineasParaServidor(),
        );
      } else {
        await editPurchaseOrder(
          id,
          notes().trim() === '' ? null : notes().trim(),
          expectedAt().trim() === '' ? null : expectedAt(),
          lineasParaServidor(),
        );
        await confirmPurchaseOrder(id);
      }
      olvidarLocal();
      beepSuccess();
      showNotice('Orden de compra creada');
      props.onDone();
    } catch {
      beepError();
      setError('No se pudo crear la orden. Revisa las líneas.');
      setSaving(false);
    }
  }

  // Tirar lo que se estaba armando. Si venía de un borrador del servidor, ese
  // también se borra: nunca salió al proveedor.
  async function cancelar(): Promise<void> {
    setConfirmandoCancelar(false);
    olvidarLocal();
    const id = props.draftId;
    if (id !== undefined) {
      try {
        await discardDraftOrder(id);
      } catch {
        beepError();
        showNotice('No se pudo borrar ese borrador.');
      }
    }
    props.onCancel();
  }

  // Cambiar de proveedor con líneas cargadas tira la orden: los productos y
  // los costos son de otro.
  function pedirCambioDeProveedor(nuevo: string): void {
    if (lines().length === 0) {
      aplicarProveedor(nuevo);
      return;
    }
    setCambiandoProveedor(nuevo);
  }

  function aplicarProveedor(nuevo: string): void {
    setSupplierId(nuevo);
    setLines([]);
    setSupplies({});
    void loadContext(nuevo);
  }

  function confirmarCambioDeProveedor(): void {
    const nuevo = cambiandoProveedor();
    setCambiandoProveedor('');
    aplicarProveedor(nuevo);
  }

  // El pie dice la verdad simple: lo que armaste queda en esta computadora
  // hasta que crees la orden. Nada de estados de sincronización.
  const textoGuardado = (): string => {
    if (!hayAlgoTecleado()) return '';
    const faltan = lines().length - lineasParaServidor().length;
    if (faltan > 0) {
      return faltan === 1
        ? 'Se guarda acá · falta completar 1 línea'
        : `Se guarda acá · faltan completar ${faltan} líneas`;
    }
    return 'Se guarda en esta computadora hasta que la crees';
  };

  return (
    <>
      <div class={`${tabla.encabezado} ${styles.encabezadoArmado}`}>
        <h3>{numeroOrden() === 0 ? 'Nueva orden' : `Borrador #${numeroOrden()}`}</h3>
        <Show when={!datosAbiertos()}>
          <button
            type="button"
            class={styles.resumenDatos}
            onClick={() => setDatosAbiertos(true)}
          >
            <span>
              <b>{(suppliers() ?? []).find((item) => item.id === supplierId())?.name ?? ''}</b>
              {expectedAt() === '' ? '' : ` · entrega ${expectedAt()}`}
              {notes().trim() === '' ? '' : ` · ${notes().trim()}`}
            </span>
            <span class={styles.cambiar}>Cambiar</span>
          </button>
        </Show>
      </div>
      {/* Cabecera fija, lista que rueda y pie fijo: con varias líneas el
          contenedor recortaba y los botones quedaban fuera de alcance. */}
      <div class={styles.armado}>
        <div class={styles.datosOrden} classList={{ [styles.plegado]: !datosAbiertos() }}>
        <div class={formStyles.fila}>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Proveedor</span>
            <select
              class={formStyles.select}
              value={supplierId()}
              onChange={(event) => {
                // Cambiar de proveedor reinicia la orden: sus productos son
                // otros. Con líneas cargadas se pregunta antes.
                const elegido = event.currentTarget.value;
                event.currentTarget.value = supplierId();
                pedirCambioDeProveedor(elegido);
              }}
            >
              <option value="">— Elige proveedor —</option>
              <For each={(suppliers() ?? []).filter((supplier) => supplier.active)}>
                {/* `selected` y no solo el value del select: la lista de
                    proveedores llega después de restaurar el borrador, y sin
                    esto el select se quedaba vacío con la orden ya cargada. */}
                {(supplier) => (
                  <option value={supplier.id} selected={supplier.id === supplierId()}>
                    {supplier.name}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Quedó en entregar el</span>
            <DateField
              inputClass={formStyles.input}
              value={expectedAt()}
              onChange={setExpectedAt}
            />
          </div>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Notas (opcional)</span>
            <input
              class={formStyles.input}
              value={notes()}
              onInput={(event) => setNotes(event.currentTarget.value)}
              placeholder="p. ej. pedido para el fin de semana"
            />
          </div>
        </div>
        </div>

        <div class={styles.agregar}>
          <div class={styles.campoBuscar}>
            <ProductPicker
            placeholder={
              supplierId() === ''
                ? 'primero elige el proveedor'
                : 'Agregar producto: busca, escanea o teclea el código y Enter'
            }
            disabled={supplierId() === ''}
            accept={(product) => !lines().some((line) => line.product.id === product.id)}
            meta={(product) =>
              product.saleType === 'weight'
                ? `${formatSoles(product.costPerKgCents)} /kg`
                : formatSoles(product.costCents)
            }
              onPick={(product) => void pickProduct(product)}
            />
          </div>
          <button
            type="button"
            class={formStyles.secundario}
            disabled={supplierId() === '' || suggesting()}
            title="Precarga los productos de este proveedor que están bajo su stock mínimo, con cantidad sugerida"
            onClick={() => void suggestLowStock()}
          >
            ⚡ Sugerir bajo mínimo
          </button>
          <Show when={context()?.lastOrder}>
            {(last) => (
              <button
                type="button"
                class={formStyles.secundario}
                title="Trae las líneas de la última orden a este proveedor"
                onClick={() => void copyLastOrder()}
              >
                Repetir orden #{last().number}
              </button>
            )}
          </Show>
        </div>

        <Show when={toAssociate()}>
          {(product) => (
            <Modal
              size="sm"
              title="Asociar producto al proveedor"
              onClose={() => setToAssociate(null)}
              footer={
                <div class={formStyles.acciones}>
                  <button
                    type="button"
                    class={formStyles.secundario}
                    onClick={() => setToAssociate(null)}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    class={formStyles.primario}
                    onClick={() => void associateAndAdd()}
                  >
                    Asociar y agregar
                  </button>
                </div>
              }
            >
              <p class={formStyles.nota}>
                «{product().name}» no está asociado a este proveedor. Se asociará (quedará
                disponible para futuras órdenes y sugerencias) y se agregará a esta orden.
              </p>
            </Modal>
          )}
        </Show>

        <div class={styles.listaLineas}>
          <Show when={lines().length === 0}>
            <p class={styles.sinLineas}>
              Todavía no agregaste productos. Búscalos arriba o usa «Sugerir bajo mínimo».
            </p>
          </Show>
          <div class={styles.lineas}>
          {/* Index, no For: For identifica filas por referencia y updateLine
              recrea el objeto en cada tecla — re-montaba la fila y el input
              perdía el foco. Index mantiene el DOM estable por posición. */}
          <Index each={lines()}>
            {(line) => (
              <div class={styles.linea}>
                <div>
                  <div class={styles.lineaNombre}>{line().product.name}</div>
                  <div class={styles.lineaSub}>{lineHint(line())}</div>
                  <Show when={costChange(line())}>
                    {(change) => (
                      <div
                        class={change().pct > 0 ? styles.subioCosto : styles.bajoCosto}
                      >
                        {change().pct > 0 ? '▲' : '▼'} {Math.abs(change().pct)}% vs la última
                        compra ({formatSoles(change().before)})
                      </div>
                    )}
                  </Show>
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>{quantityLabel(line())}</span>
                  <input
                    class={formStyles.input}
                    type="number"
                    min="0"
                    step={line().product.saleType === 'weight' ? '0.1' : '1'}
                    value={line().quantity}
                    onInput={(event) =>
                      updateLine(line().product.id, { quantity: event.currentTarget.value })
                    }
                  />
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>{costLabel(line())}</span>
                  <input
                    class={formStyles.input}
                    type="number"
                    min="0"
                    step="0.10"
                    value={line().cost}
                    onInput={(event) =>
                      updateLine(line().product.id, { cost: event.currentTarget.value })
                    }
                  />
                </div>
                <div class={formStyles.campo}>
                  <span class={formStyles.etiqueta}>Total</span>
                  <span class={styles.totalOrden} style={{ 'font-size': '15px' }}>
                    {formatSoles(lineTotalCents(line()))}
                  </span>
                </div>
                <button
                  type="button"
                  class={styles.quitar}
                  aria-label={`Quitar ${line().product.name}`}
                  onClick={() => removeLine(line().product.id)}
                >
                  ✕
                </button>
              </div>
            )}
          </Index>
          </div>
        </div>

        <div class={styles.pieOrden}>
          <p class={styles.totalOrden}>
            {lines().length} {lines().length === 1 ? 'producto' : 'productos'} ·{' '}
            {formatSoles(totalCents())}
            <Show when={(context()?.averageCents ?? 0) > 0}>
              <span class={formStyles.nota}>
                {' '}
                · sueles gastarle {formatSoles(context()?.averageCents ?? 0)}
              </span>
            </Show>
          </p>
          <Show when={error() !== ''}>
            <p class={formStyles.error}>{error()}</p>
          </Show>
          <div class={formStyles.acciones}>
            {/* Lo tecleado ya está a salvo en esta computadora; el pie lo
                dice para que nadie sienta que tiene que apurarse. */}
            <span class={`${formStyles.nota} ${styles.estadoGuardado}`} aria-live="polite">
              {textoGuardado()}
            </span>
            <button
              type="button"
              class={formStyles.secundario}
              onClick={() => setConfirmandoCancelar(true)}
            >
              Cancelar
            </button>
            {/* Dos desenlaces, los dos a pedido: dejarla anotada para seguir
                mañana, o mandarla ya. */}
            <button
              type="button"
              class={formStyles.secundario}
              disabled={!valid() || saving()}
              title="Queda en el listado como borrador, para terminarla después"
              onClick={() => void guardarBorrador()}
            >
              {props.draftId === undefined ? 'Guardar como borrador' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              class={formStyles.primario}
              disabled={!valid() || saving()}
              onClick={() => void confirmar()}
            >
              Crear orden
            </button>
          </div>
        </div>
      </div>

      <Show when={cambiandoProveedor() !== ''}>
        <ConfirmModal
          title="Cambiar de proveedor"
          confirmLabel="Cambiar y vaciar"
          onConfirm={() => void confirmarCambioDeProveedor()}
          onClose={() => setCambiandoProveedor('')}
        >
          <p class={formStyles.nota}>
            Las {lines().length} líneas que armaste son de otro proveedor: sus productos y
            sus costos no sirven acá, así que se descartan.
          </p>
        </ConfirmModal>
      </Show>

      <Show when={confirmandoCancelar()}>
        <ConfirmModal
          title="Cancelar la orden"
          confirmLabel="Sí, cancelar"
          onConfirm={() => void cancelar()}
          onClose={() => setConfirmandoCancelar(false)}
        >
          <p class={formStyles.nota}>
            Se descarta lo que armaste. No se puede deshacer.
          </p>
        </ConfirmModal>
      </Show>

    </>
  );
};
