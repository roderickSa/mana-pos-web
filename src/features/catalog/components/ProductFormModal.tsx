import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';

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
import type { ProductDto } from '@/shared/types';
import { centsToSolesInput, DIME_MESSAGE, formatKg, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { resizeImageForUpload } from '@/shared/lib/image';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import { activeCategories } from '@/shared/state/categories';
import { ProductSuppliersTab } from './ProductSuppliersTab';
import styles from '@/shared/ui/forms.module.css';
import { createFormDraft } from '@/shared/lib/form-draft';
import { currentUser } from '@/shared/state/session';
import { DraftBanner } from '@/shared/ui/DraftBanner';
import { decodeProductDraft, sameDraft, type ProductFormDraft } from './product-draft';

// Crear (con código pre-cargado si vino de un escaneo desconocido) o editar.
export type ProductFormMode =
  | { kind: 'create'; initialBarcode: string | null }
  | { kind: 'edit'; product: ProductDto };

export const ProductFormModal: Component<{
  mode: ProductFormMode;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.mode.kind === 'edit' ? props.mode.product : null;
  const initialBarcode = props.mode.kind === 'create' ? props.mode.initialBarcode : null;
  const [saleType, setSaleType] = createSignal<'unit' | 'weight'>(editing?.saleType ?? 'unit');
  const [name, setName] = createSignal(editing?.name ?? '');
  const [category, setCategory] = createSignal(editing?.category ?? 'abarrotes');
  const [barcode, setBarcode] = createSignal(editing?.barcode ?? initialBarcode ?? '');
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
  // Mínimo con default útil: 0 explícito significa "sin alerta de stock".
  const [minimum, setMinimum] = createSignal(
    editing === null
      ? '5'
      : String(editing.saleType === 'unit' ? editing.stockMinimum : editing.stockMinimumGrams),
  );
  const [initialStock, setInitialStock] = createSignal('');
  const [quickAccess, setQuickAccess] = createSignal(editing?.quickAccess ?? false);
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  // Mensaje de la advertencia de nombre repetido; se confirma con otro botón.
  const [duplicateWarning, setDuplicateWarning] = createSignal('');
  // Avisos en vivo (no bloquean): nombre parecido y código ya usado.
  const [nameWarning, setNameWarning] = createSignal('');
  const [barcodeWarning, setBarcodeWarning] = createSignal('');
  const [newAlias, setNewAlias] = createSignal('');
  const [tab, setTab] = createSignal<'datos' | 'proveedores'>('datos');

  // Lo que la persona escribió y no guardó. Doce campos son demasiados para
  // perderlos por un toque fuera del cuadro o una recarga.
  const inicial: ProductFormDraft = {
    saleType: editing?.saleType ?? 'unit',
    name: editing?.name ?? '',
    category: editing?.category ?? 'abarrotes',
    barcode: editing?.barcode ?? initialBarcode ?? '',
    shortCode: editing?.shortCode ?? '',
    price: price(),
    cost: cost(),
    minimum: minimum(),
    initialStock: '',
    quickAccess: editing?.quickAccess ?? false,
    active: editing?.active ?? true,
  };
  const actual = (): ProductFormDraft => ({
    saleType: saleType(),
    name: name(),
    category: category(),
    barcode: barcode(),
    shortCode: shortCode(),
    price: price(),
    cost: cost(),
    minimum: minimum(),
    initialStock: initialStock(),
    quickAccess: quickAccess(),
    active: active(),
  });
  const sinGuardar = (): boolean => !sameDraft(actual(), inicial);

  const draft = createFormDraft<ProductFormDraft>(
    `mana-pos:borrador:producto:${editing?.id ?? 'nuevo'}:${currentUser()?.id ?? 'anonimo'}`,
    decodeProductDraft,
    (value) => sameDraft(value, inicial),
  );
  // La imagen no entra en el borrador: una foto en base64 no cabe en el
  // navegador junto a todo lo demás, y se vuelve a elegir en dos toques.
  createEffect(() => draft.track(actual()));

  function aplicarBorrador(value: ProductFormDraft): void {
    setSaleType(value.saleType);
    setName(value.name);
    setCategory(value.category);
    setBarcode(value.barcode);
    setShortCode(value.shortCode);
    setPrice(value.price);
    setCost(value.cost);
    setMinimum(value.minimum);
    setInitialStock(value.initialStock);
    setQuickAccess(value.quickAccess);
    setActive(value.active);
  }

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

  // El costo es obligatorio: sin él el margen que reporta el sistema es falso.
  const effectiveCost = () => (cost().trim() === '' ? 0 : (solesInputToCents(cost()) ?? 0));

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

  // El precio de venta va en pasos de 10 céntimos (el costo puede ser exacto).
  const priceIsDime = () => isDimeCents(solesInputToCents(price()) ?? 0);
  const valid = () =>
    name().trim() !== '' &&
    (solesInputToCents(price()) ?? 0) > 0 &&
    priceIsDime() &&
    effectiveCost() > 0;

  // Qué le falta al formulario, dicho en cristiano bajo el botón: un botón
  // apagado sin explicación parece un bug.
  const missingHint = () => {
    if (name().trim() === '') return 'Falta el nombre del producto.';
    if ((solesInputToCents(price()) ?? 0) <= 0) return 'Falta el precio de venta.';
    if (!priceIsDime()) return DIME_MESSAGE;
    if (effectiveCost() <= 0)
      return 'Falta el costo. Búscalo en la última factura: sin costo el margen que reporta el sistema es falso.';
    return null;
  };

  async function save(allowDuplicateName = false): Promise<void> {
    const priceValue = solesInputToCents(price());
    if (!valid() || priceValue === null || saving()) return;
    setSaving(true);
    setError('');
    setDuplicateWarning('');
    const payload = {
      barcode: barcode().trim() === '' ? null : barcode().trim(),
      shortCode: shortCode().trim() === '' ? null : shortCode().trim(),
      name: name().trim(),
      category: category(),
      priceCents: priceValue,
      costCents: effectiveCost(),
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
          await registerEntry(created.id, stockValue, effectiveCost(), null);
        }
        draft.discard();
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
        draft.discard();
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
            {missingHint() ?? 'Esc cerrar'}
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
      dismissOnBackdrop={false}
      dirty={sinGuardar}
      dirtyLabel={editing === null ? 'el producto nuevo' : 'este producto'}
      onDiscard={draft.discard}
      onClose={props.onClose}
      footer={tab() === 'datos' ? footer : null}
    >
      <Show when={tab() === 'datos'}>
        <DraftBanner
          savedAt={draft.savedAt()}
          onRecover={() => {
            const value = draft.saved();
            if (value !== undefined) aplicarBorrador(value);
            draft.discard();
          }}
          onDiscard={draft.discard}
        />
      </Show>
      {/* Proveedores solo al editar: hace falta el producto para asociarlo. */}
      <Show when={editing !== null}>
        <nav class={styles.pestanas} aria-label="Secciones del producto">
          <button
            type="button"
            class={styles.pestana}
            classList={{ [styles.pestanaActiva]: tab() === 'datos' }}
            onClick={() => setTab('datos')}
          >
            Datos
          </button>
          <button
            type="button"
            class={styles.pestana}
            classList={{ [styles.pestanaActiva]: tab() === 'proveedores' }}
            onClick={() => setTab('proveedores')}
          >
            Proveedores
          </button>
        </nav>
      </Show>

      <Show when={tab() === 'proveedores' && editing !== null}>
        <ProductSuppliersTab
          productId={editing?.id ?? ''}
          productName={editing?.name ?? ''}
          saleType={editing?.saleType ?? 'unit'}
          priceCents={
            editing?.saleType === 'weight' ? editing.pricePerKgCents : (editing?.priceCents ?? 0)
          }
        />
      </Show>

      <div class={styles.form} classList={{ [styles.oculto]: tab() !== 'datos' }}>
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
              <div class={styles.alias}>
                <For each={aliases()?.barcodes ?? []}>
                  {(code) => (
                    <span class={styles.aliasChip}>
                      {code}
                      <button
                        type="button"
                        class={styles.aliasQuitar}
                        aria-label={`Quitar código ${code}`}
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
            </span>
            <input
              class={styles.input}
              type="number"
              step="0.10"
              min="0"
              placeholder="lo que te cuesta a ti"
              value={cost()}
              onInput={(event) => setCost(event.currentTarget.value)}
            />
          </div>
        </div>
        <p class={styles.nota} classList={{ [styles.error]: marginNegative() || !priceIsDime() }}>
          {!priceIsDime() && price().trim() !== ''
            ? 'El precio va en pasos de 10 céntimos (S/ 0.10 es la moneda mínima).'
            : marginLabel()}
          {marginNegative() ? ' — el precio está por debajo del costo' : ''}
        </p>

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
                void resizeImageForUpload(file)
                  .then((dataUrl) => {
                    setImageDataUrl(dataUrl);
                    setRemoveImage(false);
                  })
                  .catch(() => {
                    beepError();
                    setError('No se pudo leer la imagen. Prueba con otra foto (PNG, JPG o WebP).');
                  });
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
