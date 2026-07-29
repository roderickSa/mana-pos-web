import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import {
  createProduct,
  removeProductImage,
  setProductImage,
  updateProduct,
} from '@/shared/api/products';
import { createSupplier, listSuppliers } from '@/shared/api/suppliers';
import type { ProductDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import { CATEGORIES } from '@/shared/lib/categories';
import styles from '@/shared/ui/forms.module.css';

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

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
      : centsToInput(editing.saleType === 'unit' ? editing.priceCents : editing.pricePerKgCents),
  );
  const [cost, setCost] = createSignal(
    editing === null
      ? ''
      : centsToInput(editing.saleType === 'unit' ? editing.costCents : editing.costPerKgCents),
  );
  const [minimum, setMinimum] = createSignal(
    editing === null
      ? '0'
      : String(editing.saleType === 'unit' ? editing.stockMinimum : editing.stockMinimumGrams),
  );
  const [quickAccess, setQuickAccess] = createSignal(editing?.quickAccess ?? false);
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [supplierId, setSupplierId] = createSignal(editing?.supplierId ?? '');
  const [newSupplierName, setNewSupplierName] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const [suppliers, { refetch: refetchSuppliers }] = createResource(listSuppliers);

  async function quickCreateSupplier(): Promise<void> {
    const supplierName = newSupplierName().trim();
    if (supplierName === '') return;
    try {
      const created = await createSupplier(supplierName);
      setNewSupplierName('');
      await refetchSuppliers();
      setSupplierId(created.id);
    } catch {
      setError('No se pudo crear el proveedor.');
    }
  }

  const valid = () =>
    name().trim() !== '' &&
    !Number.isNaN(inputToCents(price())) &&
    inputToCents(price()) > 0 &&
    !Number.isNaN(inputToCents(cost()));

  async function save(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    setError('');
    const payload = {
      barcode: barcode().trim() === '' ? null : barcode().trim(),
      shortCode: shortCode().trim() === '' ? null : shortCode().trim(),
      name: name().trim(),
      category: category(),
      supplierId: supplierId() === '' ? null : supplierId(),
      priceCents: inputToCents(price()),
      costCents: inputToCents(cost()),
      stockMinimum: Number.parseInt(minimum(), 10) || 0,
      quickAccess: quickAccess(),
    };
    try {
      if (editing === null) {
        const created = await createProduct({ ...payload, saleType: saleType() });
        const image = imageDataUrl();
        if (image !== null) {
          await setProductImage(created.id, image);
        }
        props.onDone(`Producto «${payload.name}» creado`);
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

  return (
    <Modal title={editing === null ? 'Nuevo producto' : 'Editar producto'} onClose={props.onClose}>
      <div class={styles.form}>
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
          <span class={styles.etiqueta}>Nombre</span>
          <input
            class={styles.input}
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
            placeholder="p. ej. Arroz Costeño 750 g"
          />
        </div>

        <div class={styles.fila}>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Categoría</span>
            <select
              class={styles.select}
              value={category()}
              onChange={(event) => setCategory(event.currentTarget.value)}
            >
              {CATEGORIES.filter((item) => item.key !== null).map((item) => (
                <option value={item.key ?? ''}>{item.label}</option>
              ))}
            </select>
          </div>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Código de barras (opcional)</span>
            <input
              class={styles.input}
              value={barcode()}
              onInput={(event) => setBarcode(event.currentTarget.value)}
              placeholder="escanéalo aquí"
            />
          </div>
        </div>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>Código corto (1-3 dígitos, para teclearlo en la caja)</span>
          <input
            class={styles.input}
            inputmode="numeric"
            maxLength={3}
            value={shortCode()}
            onInput={(event) => setShortCode(event.currentTarget.value.replace(/\D/g, ''))}
            placeholder="p. ej. 12 para el pan"
          />
        </div>

        <div class={styles.campo}>
          <span class={styles.etiqueta}>Proveedor</span>
          <select
            class={styles.select}
            value={supplierId()}
            onChange={(event) => setSupplierId(event.currentTarget.value)}
          >
            <option value="">— Sin proveedor —</option>
            <For each={suppliers() ?? []}>
              {(supplier) => <option value={supplier.id}>{supplier.name}</option>}
            </For>
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              class={styles.input}
              value={newSupplierName()}
              onInput={(event) => setNewSupplierName(event.currentTarget.value)}
              placeholder="¿proveedor nuevo? escribe su nombre"
            />
            <button
              type="button"
              class={styles.secundario}
              disabled={newSupplierName().trim() === ''}
              onClick={quickCreateSupplier}
            >
              Crear
            </button>
          </div>
        </div>

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
              value={cost()}
              onInput={(event) => setCost(event.currentTarget.value)}
            />
          </div>
        </div>

        <div class={styles.fila}>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Stock mínimo ({unitLabel()})</span>
            <input
              class={styles.input}
              type="number"
              min="0"
              value={minimum()}
              onInput={(event) => setMinimum(event.currentTarget.value)}
            />
          </div>
          <div class={styles.campo}>
            <span class={styles.etiqueta}>Opciones</span>
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
          </div>
        </div>

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
          <span class={styles.etiqueta} style={{ 'text-transform': 'none', 'letter-spacing': '0' }}>
            Sin imagen se muestra el ícono de la categoría
          </span>
        </div>

        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>

        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={styles.primario} disabled={!valid() || saving()} onClick={save}>
            {editing === null ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
