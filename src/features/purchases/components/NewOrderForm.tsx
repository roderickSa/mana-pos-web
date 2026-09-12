import {createResource, createSignal, For, Index, Show, type Component } from 'solid-js';


import {createPurchaseOrder } from '@/shared/api/purchases';
import {linkProductSupplier, searchProducts } from '@/shared/api/products';
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
import {type DraftLine, packSizeOf, quantityUnits, unitCostCents, lineTotalCents } from './purchase-lines';

export const NewOrderForm: Component<{ onDone: () => void; onCancel: () => void }> = (props) => {
  const [suppliers] = createResource(listSuppliers);
  const [supplierId, setSupplierId] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [lines, setLines] = createSignal<DraftLine[]>([]);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [suggesting, setSuggesting] = createSignal(false);
  const [toAssociate, setToAssociate] = createSignal<ProductDto | null>(null);

  // Reposición sugerida: llegar a 2× el mínimo. En cajas si se compra por
  // caja; en kilos con un decimal para pesables.
  function suggestedQuantity(product: ProductDto): string {
    if (product.saleType === 'weight') {
      const neededGrams = Math.max(product.stockMinimumGrams * 2 - product.stockGrams, 500);
      return String(Math.ceil(neededGrams / 100) / 10);
    }
    const needed = Math.max(product.stockMinimum * 2 - product.stockUnits, 1);
    const packSize = packSizeOf(product);
    if (packSize !== null) return String(Math.max(1, Math.ceil(needed / packSize)));
    return String(needed);
  }

  function isLowStock(product: ProductDto): boolean {
    if (product.saleType === 'weight') {
      return product.stockMinimumGrams > 0 && product.stockGrams <= product.stockMinimumGrams;
    }
    return product.stockMinimum > 0 && product.stockUnits <= product.stockMinimum;
  }

  // El botón que evita armar la orden de memoria: precarga lo que este
  // proveedor surte y está bajo mínimo, con cantidad sugerida editable.
  async function suggestLowStock(): Promise<void> {
    if (supplierId() === '' || suggesting()) return;
    setSuggesting(true);
    try {
      const products = await searchProducts('', null, false, false, supplierId());
      const low = products.filter(isLowStock);
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
      for (const product of fresh) {
        addProduct(product, suggestedQuantity(product));
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
  function pickProduct(product: ProductDto): void {
    if (supplierId() === '') return;
    if (product.supplierIds.includes(supplierId())) {
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
      addProduct(product);
      beepOk();
      showNotice(`«${product.name}» quedó asociado a este proveedor`);
    } catch {
      beepError();
      showNotice('No se pudo asociar el producto.');
    }
    setToAssociate(null);
  }

  function addProduct(product: ProductDto, quantity = ''): void {
    const packSize = packSizeOf(product);
    // Costo sugerido: última compra (por caja si se compra por caja).
    const suggested =
      product.saleType === 'weight'
        ? product.costPerKgCents
        : packSize !== null
          ? product.packCostCents
          : product.costCents;
    setLines([
      ...lines(),
      {
        product,
        quantity,
        cost: suggested === null || suggested <= 0 ? '' : centsToSolesInput(suggested),
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
    if (packSizeOf(line.product) !== null) return 'Cajas';
    return line.product.saleType === 'weight' ? 'Kilos' : 'Unidades';
  }

  function costLabel(line: DraftLine): string {
    if (packSizeOf(line.product) !== null) return 'Costo/caja S/';
    return line.product.saleType === 'weight' ? 'Costo/kg S/' : 'Costo/u S/';
  }

  function lineHint(line: DraftLine): string {
    const packSize = packSizeOf(line.product);
    const units = quantityUnits(line);
    const cost = unitCostCents(line);
    if (packSize !== null && units > 0) {
      return `= ${units} unidades${cost === null ? '' : ` a ${formatSoles(cost)} c/u`}`;
    }
    return '';
  }

  async function save(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    setError('');
    try {
      await createPurchaseOrder(
        supplierId(),
        notes().trim() === '' ? null : notes().trim(),
        lines().map((line) => {
          const packSize = packSizeOf(line.product);
          return {
            productId: line.product.id,
            quantity: quantityUnits(line),
            unitCostCents: unitCostCents(line) ?? 0,
            packSize,
            packCostCents: packSize === null ? null : solesInputToCents(line.cost),
          };
        }),
      );
      beepSuccess();
      showNotice('Orden de compra creada');
      props.onDone();
    } catch {
      beepError();
      setError('No se pudo crear la orden. Revisa las líneas.');
      setSaving(false);
    }
  }

  return (
    <>
      <div class={tabla.encabezado}>
        <h2>Nueva orden de compra</h2>
      </div>
      {/* Bloque contenido: a ancho completo el nombre quedaba pegado a la
          izquierda y el costo a 1200px de distancia. */}
      <div class={formStyles.form} style={{ 'max-width': '860px' }}>
        <div class={formStyles.fila}>
          <div class={formStyles.campo}>
            <span class={formStyles.etiqueta}>Proveedor</span>
            <select
              class={formStyles.select}
              value={supplierId()}
              onChange={(event) => {
                // Cambiar de proveedor reinicia la orden: sus productos son otros.
                setSupplierId(event.currentTarget.value);
                setLines([]);
              }}
            >
              <option value="">— Elige proveedor —</option>
              <For each={(suppliers() ?? []).filter((supplier) => supplier.active)}>
                {(supplier) => <option value={supplier.id}>{supplier.name}</option>}
              </For>
            </select>
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

        <div class={formStyles.campo}>
          <span class={formStyles.etiqueta}>
            Agregar producto (nombre, o escanea el código y Enter)
          </span>
          <ProductPicker
            placeholder={
              supplierId() === ''
                ? 'primero elige el proveedor'
                : 'busca por nombre, escanea o teclea el código y Enter'
            }
            disabled={supplierId() === ''}
            accept={(product) => !lines().some((line) => line.product.id === product.id)}
            meta={(product) =>
              product.saleType === 'weight'
                ? `${formatSoles(product.costPerKgCents)} /kg`
                : product.packSize !== null && product.packCostCents !== null
                  ? `caja ×${product.packSize} · ${formatSoles(product.packCostCents)}`
                  : formatSoles(product.costCents)
            }
            onPick={pickProduct}
          />
          <div class={formStyles.acciones} style={{ 'justify-content': 'flex-start' }}>
            <button
              type="button"
              class={formStyles.secundario}
              disabled={supplierId() === '' || suggesting()}
              title="Precarga los productos de este proveedor que están bajo su stock mínimo, con cantidad sugerida"
              onClick={() => void suggestLowStock()}
            >
              ⚡ Sugerir bajo mínimo
            </button>
          </div>
          <p class={formStyles.nota}>
            Puedes buscar cualquier producto: si no está asociado a este proveedor, te
            preguntará si lo asocias al agregarlo.
          </p>
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

        <Show when={lines().length > 0}>
          <p class={styles.totalOrden}>Total de la orden: {formatSoles(totalCents())}</p>
        </Show>
        <Show when={error() !== ''}>
          <p class={formStyles.error}>{error()}</p>
        </Show>

        <div class={formStyles.acciones}>
          <button type="button" class={formStyles.secundario} onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" class={formStyles.primario} disabled={!valid() || saving()} onClick={save}>
            Crear orden
          </button>
        </div>
      </div>
    </>
  );
};
