import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import {
  addProductBarcode,
  createProduct,
  getProductByBarcode,
  listProductBarcodes,
  removeProductBarcode,
  removeProductImage,
  searchProducts,
  setProductImage,
  updateProduct,
} from '@/shared/api/products';
import { registerEntry } from '@/shared/api/inventory';
import { createSupplier, listSuppliers } from '@/shared/api/suppliers';
import type { ProductDto } from '@/shared/types';
import { centsToSolesInput, formatKg, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import { activeCategories } from '@/shared/state/categories';
import styles from '@/shared/ui/forms.module.css';

export const ProductFormModal: Component<{
  product: ProductDto | null; // null = crear
  initialBarcode: string | null; // pre-carga al crear desde un escaneo desconocido
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.product;
  const [saleType, setSaleType] = createSignal<'unit' | 'weight'>(editing?.saleType ?? 'unit');
  const [name, setName] = createSignal(editing?.name ?? '');
  const [category, setCategory] = createSignal(editing?.category ?? 'abarrotes');
  const [barcode, setBarcode] = createSignal(editing?.barcode ?? props.initialBarcode ?? '');
  const [shortCode, setShortCode] = createSignal(editing?.shortCode ?? '');
  const [imageDataUrl, setImageDataUrl] = createSignal<string | null>(null);
  const [removeImage, setRemoveImage] = createSignal(false);
  const [price, setPrice] = createSignal(
    editing === null
      ? ''
      : centsToSolesInput(editing.saleType === 'unit' ? editing.priceCents : editing.pricePerKgCents),
  );
  // El costo arranca VACÍO al crear: vacío = "no lo sé" (se muestra —),
  // que no es lo mismo que un costo real de cero.
  const [cost, setCost] = createSignal(
    editing === null
      ? ''
      : centsToSolesInput(editing.saleType === 'unit' ? editing.costCents : editing.costPerKgCents),
  );
  const [packSize, setPackSize] = createSignal(
    editing !== null && editing.saleType === 'unit' && editing.packSize !== null
      ? String(editing.packSize)
      : '',
  );
  const [packCost, setPackCost] = createSignal(
    editing !== null && editing.saleType === 'unit' && editing.packCostCents !== null
      ? centsToSolesInput(editing.packCostCents)
      : '',
  );
  // Mínimo con default útil: 0 explícito significa "sin alerta de stock".
  const [minimum, setMinimum] = createSignal(
    editing === null
      ? '5'
      : String(editing.saleType === 'unit' ? editing.stockMinimum : editing.stockMinimumGrams),
  );
  const [initialStock, setInitialStock] = createSignal('');
  const [quickAccess, setQuickAccess] = createSignal(editing?.quickAccess ?? false);
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [supplierIds, setSupplierIds] = createSignal<string[]>(editing?.supplierIds ?? []);
  const [creatingSupplier, setCreatingSupplier] = createSignal(false);
  const [newSupplierName, setNewSupplierName] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  // Mensaje de la advertencia de nombre repetido; se confirma con otro botón.
  const [duplicateWarning, setDuplicateWarning] = createSignal('');
  // Avisos en vivo (no bloquean): nombre parecido y código ya usado.
  const [nameWarning, setNameWarning] = createSignal('');
  const [barcodeWarning, setBarcodeWarning] = createSignal('');
  const [newAlias, setNewAlias] = createSignal('');

  const [suppliers, { refetch: refetchSuppliers }] = createResource(listSuppliers);
  const [aliases, { refetch: refetchAliases }] = createResource(async () =>
    editing === null ? null : listProductBarcodes(editing.id),
  );

  async function addAlias(): Promise<void> {
    const aliasBarcode = newAlias().trim();
    if (editing === null || aliasBarcode === '') return;
    try {
      await addProductBarcode(editing.id, aliasBarcode);
      setNewAlias('');
      await refetchAliases();
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.code === 'BARCODE_ALREADY_IN_USE') {
        setError('Ese código ya pertenece a otro producto.');
      } else {
        setError('No se pudo agregar el código.');
      }
    }
  }

  async function removeAlias(aliasBarcode: string): Promise<void> {
    if (editing === null) return;
    try {
      await removeProductBarcode(editing.id, aliasBarcode);
      await refetchAliases();
    } catch {
      beepError();
    }
  }

  async function quickCreateSupplier(): Promise<void> {
    const supplierName = newSupplierName().trim();
    if (supplierName === '') return;
    try {
      const created = await createSupplier(supplierName);
      setNewSupplierName('');
      setCreatingSupplier(false);
      await refetchSuppliers();
      setSupplierIds([...supplierIds(), created.id]);
    } catch {
      beepError();
      setError('No se pudo crear el proveedor.');
    }
  }

  // Validación en vivo: al salir del nombre se busca un producto igual (la
  // red que atrapa a la segunda Inca Kola ANTES de llenar todo el form).
  async function checkNameInUse(): Promise<void> {
    const text = name().trim();
    if (editing !== null || text === '') {
      setNameWarning('');
      return;
    }
    try {
      const matches = await searchProducts(text, null, true);
      const same = matches.find((item) => item.name.toLowerCase() === text.toLowerCase());
      setNameWarning(same === undefined ? '' : `Ya existe «${same.name}». ¿Es el mismo producto?`);
    } catch {
      setNameWarning('');
    }
  }

  async function checkBarcodeInUse(): Promise<void> {
    const code = barcode().trim();
    if (code === '') {
      setBarcodeWarning('');
      return;
    }
    try {
      const owner = await getProductByBarcode(code);
      const taken = owner !== null && (editing === null || owner.id !== editing.id);
      setBarcodeWarning(taken ? `Ese código ya es de «${owner?.name ?? ''}».` : '');
    } catch {
      setBarcodeWarning('');
    }
  }

  // Empaque: unidades por caja + costo por caja, juntos o ninguno. Con
  // empaque completo, el costo unitario se deriva y el campo Costo se apaga.
  const packSizeValue = () => {
    const parsed = Number.parseInt(packSize(), 10);
    return Number.isNaN(parsed) || parsed < 1 ? null : parsed;
  };
  const packCostValue = () => {
    const cents = solesInputToCents(packCost());
    return cents === null || cents <= 0 ? null : cents;
  };
  const packEmpty = () => packSize().trim() === '' && packCost().trim() === '';
  const packComplete = () =>
    saleType() === 'unit' && packSizeValue() !== null && packCostValue() !== null;
  const derivedUnitCost = () => {
    const size = packSizeValue();
    const packCents = packCostValue();
    return size === null || packCents === null ? null : Math.round(packCents / size);
  };
  // Vacío = sin costo (0 en la API, que la tabla muestra como "—").
  const effectiveCost = () =>
    derivedUnitCost() ?? (cost().trim() === '' ? 0 : (solesInputToCents(cost()) ?? 0));
  const costIsExplicitZero = () => !packComplete() && cost().trim() !== '' && effectiveCost() === 0;

  const marginLabel = () => {
    const priceValue = solesInputToCents(price());
    if (priceValue === null || priceValue <= 0 || effectiveCost() <= 0) {
      return 'Captura el costo para ver el margen';
    }
    const margin = priceValue - effectiveCost();
    const pct = Math.round((margin / priceValue) * 100);
    return `Margen: ${formatSoles(margin)} · ${pct}%`;
  };
  const marginNegative = () => {
    const priceValue = solesInputToCents(price());
    return priceValue !== null && effectiveCost() > 0 && priceValue < effectiveCost();
  };

  const valid = () =>
    name().trim() !== '' &&
    (solesInputToCents(price()) ?? 0) > 0 &&
    (saleType() !== 'unit' || packEmpty() || packComplete());

  async function save(allowDuplicateName = false): Promise<void> {
    const priceValue = solesInputToCents(price());
    if (!valid() || priceValue === null || saving()) return;
    setSaving(true);
    setError('');
    setDuplicateWarning('');
    const isUnit = saleType() === 'unit';
    const payload = {
      barcode: barcode().trim() === '' ? null : barcode().trim(),
      shortCode: shortCode().trim() === '' ? null : shortCode().trim(),
      name: name().trim(),
      category: category(),
      supplierIds: supplierIds(),
      priceCents: priceValue,
      costCents: effectiveCost(),
      packSize: isUnit ? packSizeValue() : null,
      packCostCents: isUnit ? packCostValue() : null,
      stockMinimum: Number.parseInt(minimum(), 10) || 0,
      quickAccess: quickAccess(),
    };
    try {
      if (editing === null) {
        const created = await createProduct({ ...payload, saleType: saleType(), allowDuplicateName });
        const image = imageDataUrl();
        if (image !== null) {
          await setProductImage(created.id, image);
        }
        // Stock inicial en el mismo alta: genera la entrada de kardex de una.
        const stockValue = Number.parseInt(initialStock(), 10) || 0;
        if (stockValue > 0) {
          await registerEntry(
            created.id,
            stockValue,
            effectiveCost() > 0 ? effectiveCost() : null,
            null,
          );
        }
        props.onDone(
          `Producto «${payload.name}» creado${stockValue > 0 ? ` con ${stockValue} de stock` : ''}`,
        );
      } else {
        await updateProduct(editing.id, { ...payload, active: active() });
        const image = imageDataUrl();
        if (image !== null) {
          await setProductImage(editing.id, image);
        } else if (removeImage() && editing.imagePath !== null) {
          await removeProductImage(editing.id);
        }
        props.onDone(`Producto «${payload.name}» actualizado`);
      }
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.code === 'DUPLICATE_NAME') {
        setDuplicateWarning(cause.serverMessage ?? 'Ya existe un producto con ese nombre.');
        setSaving(false);
        return;
      }
      if (cause instanceof ApiError && cause.code === 'BARCODE_ALREADY_IN_USE') {
        setError('Ese código de barras ya pertenece a otro producto.');
      } else if (cause instanceof ApiError && cause.serverMessage !== null) {
        setError(cause.serverMessage);
      } else {
        setError('No se pudo guardar. Revisa los datos e intenta de nuevo.');
      }
      setSaving(false);
    }
  }

  const unitLabel = () => (saleType() === 'unit' ? 'unidades' : 'gramos');

  const footer = (
    <div class={styles.form} style={{ gap: '10px' }}>
      <Show when={error() !== ''}>
        <p class={styles.error}>{error()}</p>
      </Show>
      <Show
        when={duplicateWarning() === ''}
        fallback={
          <>
            <p class={styles.error}>{duplicateWarning()}</p>
            <div class={styles.acciones}>
              <button type="button" class={styles.secundario} onClick={() => setDuplicateWarning('')}>
                Revisar
              </button>
              <button type="button" class={styles.primario} onClick={() => void save(true)}>
                Crear de todos modos
              </button>
            </div>
          </>
        }
      >
        <div class={styles.acciones}>
          <span class={styles.etiqueta} style={{ 'margin-right': 'auto', 'align-self': 'center' }}>
            Esc cerrar
          </span>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={styles.primario}
            disabled={!valid() || saving()}
            onClick={() => void save()}
          >
            {editing === null ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </Show>
    </div>
  );

  return (
    <Modal
      size="lg"
      title={editing === null ? 'Nuevo producto' : `Editar — ${editing.name}`}
      onClose={props.onClose}
      footer={footer}
    >
      <div class={styles.form}>
        <p class={styles.seccion}>Identificación</p>

        <div class={styles.fila}>
          <Show when={editing === null}>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Se vende por</span>
              <select
                class={styles.select}
                value={saleType()}
                onChange={(event) => setSaleType(event.currentTarget.value === 'weight' ? 'weight' : 'unit')}
              >
                <option value="unit">Unidad</option>
                <option value="weight">Peso (kg)</option>
              </select>
            </div>
          </Show>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Categoría</span>
            <select
              class={styles.select}
              value={category()}
              onChange={(event) => setCategory(event.currentTarget.value)}
            >
              {activeCategories().map((item) => (
                <option value={item.slug}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>Nombre</span>
          <input
            class={styles.input}
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            onBlur={() => void checkNameInUse()}
            placeholder="p. ej. Arroz Costeño 750 g"
            autofocus
          />
          <Show when={nameWarning() !== ''}>
            <p class={styles.error}>{nameWarning()}</p>
          </Show>
        </div>

        <div class={styles.fila}>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Código de barras (opcional)</span>
            <input
              class={styles.input}
              value={barcode()}
              onInput={(event) => setBarcode(event.currentTarget.value)}
              onBlur={() => void checkBarcodeInUse()}
              placeholder="escanéalo aquí"
            />
            <Show when={barcodeWarning() !== ''}>
              <p class={styles.error}>{barcodeWarning()}</p>
            </Show>
          </div>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Código corto (1-3 dígitos, para la caja)</span>
            <input
              class={styles.input}
              inputmode="numeric"
              maxLength={3}
              value={shortCode()}
              onInput={(event) => setShortCode(event.currentTarget.value.replace(/\D/g, ''))}
              placeholder="p. ej. 12 para el pan"
            />
          </div>
        </div>

        <Show when={editing !== null}>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Códigos de barras adicionales (alias)</span>
            <Show when={(aliases()?.barcodes.length ?? 0) > 0}>
              <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
                <For each={aliases()?.barcodes ?? []}>
                  {(code) => (
                    <span
                      style={{
                        display: 'inline-flex',
                        'align-items': 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        'border-radius': '999px',
                        background: 'var(--superficie-app)',
                        'font-variant-numeric': 'tabular-nums',
                      }}
                    >
                      {code}
                      <button
                        type="button"
                        aria-label={`Quitar código ${code}`}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', 'min-width': '24px' }}
                        onClick={() => void removeAlias(code)}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                class={styles.input}
                inputmode="numeric"
                placeholder="escanea aquí el código nuevo"
                value={newAlias()}
                onInput={(event) => setNewAlias(event.currentTarget.value.replace(/\D/g, ''))}
                onKeyDown={(event) => event.key === 'Enter' && void addAlias()}
              />
              <button
                type="button"
                class={styles.secundario}
                disabled={newAlias().trim() === ''}
                onClick={() => void addAlias()}
              >
                Agregar
              </button>
            </div>
          </div>
        </Show>

        <p class={styles.seccion}>Precio y costo</p>

        <div class={styles.fila}>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>
              Precio venta S/ {saleType() === 'weight' ? 'por kg' : ''}
            </span>
            <input
              class={styles.input}
              type="number"
              step="0.10"
              min="0"
              value={price()}
              onInput={(event) => setPrice(event.currentTarget.value)}
            />
          </div>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>
              Costo S/ {saleType() === 'weight' ? 'por kg' : ''}
              {packComplete() ? ' (derivado de la caja)' : ''}
            </span>
            <input
              class={styles.input}
              type="number"
              step="0.10"
              min="0"
              placeholder="vacío = sin costo"
              value={packComplete() ? centsToSolesInput(derivedUnitCost() ?? 0) : cost()}
              disabled={packComplete()}
              onInput={(event) => setCost(event.currentTarget.value)}
            />
          </div>
        </div>
        <p class={styles.nota} classList={{ [styles.error]: marginNegative() }}>
          {marginLabel()}
          {marginNegative() ? ' — el precio está por debajo del costo' : ''}
        </p>
        <Show when={costIsExplicitZero()}>
          <p class={styles.error}>
            Costo 0 no es «sin costo»: produciría un margen falso de 100%. Déjalo vacío si no lo
            sabes.
          </p>
        </Show>

        <Show when={saleType() === 'unit'}>
          <div class={styles.fila}>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Unidades por caja/paquete (opcional)</span>
              <input
                class={styles.input}
                type="number"
                min="1"
                step="1"
                placeholder="p. ej. 12"
                value={packSize()}
                onInput={(event) => setPackSize(event.currentTarget.value.replace(/\D/g, ''))}
              />
            </div>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Costo por caja/paquete S/</span>
              <input
                class={styles.input}
                type="number"
                step="0.10"
                min="0"
                placeholder="lo que cuesta la caja"
                value={packCost()}
                onInput={(event) => setPackCost(event.currentTarget.value)}
              />
            </div>
          </div>
          <Show when={!packEmpty() && !packComplete()}>
            <p class={styles.error}>Completa unidades por caja y costo por caja, o deja ambos vacíos.</p>
          </Show>
          <Show when={packComplete()}>
            <p class={styles.nota}>
              Caja de {packSizeValue()} → costo unitario {formatSoles(derivedUnitCost() ?? 0)}
            </p>
          </Show>
        </Show>

        <p class={styles.seccion}>Inventario</p>

        <Show when={editing !== null && editing.saleType === 'unit'}>
          <p class={styles.nota}>
            Stock actual: <b>{editing?.saleType === 'unit' ? editing.stockUnits : 0} unidades</b> —
            se ajusta desde Ajustes de stock, no desde aquí.
          </p>
        </Show>
        <Show when={editing !== null && editing.saleType === 'weight'}>
          <p class={styles.nota}>
            Stock actual: <b>{formatKg(editing?.saleType === 'weight' ? editing.stockGrams : 0)}</b>{' '}
            — se ajusta desde Ajustes de stock, no desde aquí.
          </p>
        </Show>

        <div class={styles.fila}>
          <Show when={editing === null}>
            <div class={styles.campo}>
              <span class={styles.etiqueta}>Stock inicial ({unitLabel()})</span>
              <input
                class={styles.input}
                type="number"
                min="0"
                step="1"
                placeholder="0 = sin stock aún"
                value={initialStock()}
                onInput={(event) => setInitialStock(event.currentTarget.value)}
              />
            </div>
          </Show>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Stock mínimo ({unitLabel()})</span>
            <input
              class={styles.input}
              type="number"
              min="0"
              value={minimum()}
              onInput={(event) => setMinimum(event.currentTarget.value)}
            />
            <Show when={(Number.parseInt(minimum(), 10) || 0) === 0}>
              <span class={styles.etiqueta}>0 = sin alerta de stock bajo para este producto</span>
            </Show>
          </div>
        </div>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>
            Proveedores (ninguno = costo directo, sin orden de compra)
          </span>
          <For each={suppliers() ?? []}>
            {(supplier) => (
              <label class={styles.check}>
                <input
                  type="checkbox"
                  checked={supplierIds().includes(supplier.id)}
                  onChange={(event) =>
                    setSupplierIds(
                      event.currentTarget.checked
                        ? [...supplierIds(), supplier.id]
                        : supplierIds().filter((id) => id !== supplier.id),
                    )
                  }
                />
                {supplier.name}
              </label>
            )}
          </For>
          <Show
            when={creatingSupplier()}
            fallback={
              <button
                type="button"
                class={styles.secundario}
                style={{ 'align-self': 'flex-start' }}
                onClick={() => setCreatingSupplier(true)}
              >
                + Crear proveedor…
              </button>
            }
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                class={styles.input}
                value={newSupplierName()}
                onInput={(event) => setNewSupplierName(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Enter' && void quickCreateSupplier()}
                placeholder="nombre del proveedor nuevo"
                autofocus
              />
              <button
                type="button"
                class={styles.secundario}
                disabled={newSupplierName().trim() === ''}
                onClick={() => void quickCreateSupplier()}
              >
                Crear
              </button>
            </div>
          </Show>
        </div>

        <p class={styles.seccion}>Opciones</p>

        <label class={styles.check}>
          <input
            type="checkbox"
            checked={quickAccess()}
            onChange={(event) => setQuickAccess(event.currentTarget.checked)}
          />
          Acceso rápido en la venta
        </label>
        <Show when={editing !== null}>
          <label class={styles.check}>
            <input
              type="checkbox"
              checked={active()}
              onChange={(event) => setActive(event.currentTarget.checked)}
            />
            Activo (se puede vender)
          </label>
        </Show>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>Imagen (opcional)</span>
          <Show when={imageDataUrl() ?? (!removeImage() ? editing?.imagePath : null)}>
            {(src) => (
              <img
                src={src()}
                alt="Vista previa"
                style={{ width: '72px', height: '72px', 'object-fit': 'cover', 'border-radius': '10px' }}
              />
            )}
          </Show>
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <input
              class={styles.input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file === undefined) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setImageDataUrl(reader.result);
                    setRemoveImage(false);
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
            <Show when={editing?.imagePath !== null && editing !== null && !removeImage()}>
              <button
                type="button"
                class={styles.secundario}
                onClick={() => {
                  setImageDataUrl(null);
                  setRemoveImage(true);
                }}
              >
                Quitar
              </button>
            </Show>
          </div>
          <span class={styles.etiqueta}>Sin imagen se muestra el ícono de la categoría</span>
        </div>
      </div>
    </Modal>
  );
};
