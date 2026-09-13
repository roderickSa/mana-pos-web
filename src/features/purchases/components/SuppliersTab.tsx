import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  linkProductSupplier,
  linkProductsToSupplier,
  listProductSupplies,
  saveProductSupply,
  searchProducts,
  unlinkProductSupplier,
  type ProductSupplyDto,
} from '@/shared/api/products';
import { centsToSolesInput, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { allCategories } from '@/shared/state/categories';
import { Chip } from '@/shared/ui/Chip';
import { TableFooter } from '@/shared/ui/TableFooter';
import { ProductPicker } from '@/shared/ui/ProductPicker';
import { createSupplier, listSuppliers, updateSupplier } from '@/shared/api/suppliers';
import { beepError, beepOk } from '@/shared/lib/sounds';
import type { ProductDto } from '@/shared/types';
import { showNotice } from '@/shared/state/notices';
import type { SupplierDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import { EmptyState } from '@/shared/ui/EmptyState';
import { apiErrorMessage } from '@/shared/api/client';

const DIAS: Array<{ key: string; label: string }> = [
  { key: 'lun', label: 'Lun' },
  { key: 'mar', label: 'Mar' },
  { key: 'mie', label: 'Mié' },
  { key: 'jue', label: 'Jue' },
  { key: 'vie', label: 'Vie' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
];

const SupplierFormModal: Component<{
  supplier: SupplierDto | null;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.supplier;
  const [name, setName] = createSignal(editing?.name ?? '');
  const [phone, setPhone] = createSignal(editing?.phone ?? '');
  const [notes, setNotes] = createSignal(editing?.notes ?? '');
  const [visitDays, setVisitDays] = createSignal<string[]>(editing?.visitDays ?? []);
  const [contactName, setContactName] = createSignal(editing?.contactName ?? '');
  const [paymentTerms, setPaymentTerms] = createSignal(editing?.paymentTerms ?? '');
  const [active, setActive] = createSignal(editing?.active ?? true);

  function toggleDay(day: string): void {
    setVisitDays((days) =>
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day],
    );
  }
  const [error, setError] = createSignal('');

  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving() || name().trim() === '') return;
    setSaving(true);
    const payload = {
      name: name().trim(),
      phone: phone().trim() === '' ? null : phone().trim(),
      notes: notes().trim() === '' ? null : notes().trim(),
      visitDays: visitDays(),
      contactName: contactName().trim() === '' ? null : contactName().trim(),
      paymentTerms: paymentTerms().trim() === '' ? null : paymentTerms().trim(),
      active: active(),
    };
    try {
      if (editing === null) {
        const created = await createSupplier(payload.name);
        // El alta rápida solo lleva nombre; completa teléfono/notas en una edición.
        if (payload.phone !== null || payload.notes !== null) {
          await updateSupplier(created.id, payload);
        }
        props.onDone(`Proveedor «${payload.name}» creado`);
      } else {
        await updateSupplier(editing.id, payload);
        props.onDone(`Proveedor «${payload.name}» actualizado`);
      }
    } catch (cause) {
      setError(apiErrorMessage(cause, 'No se pudo guardar el proveedor.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="md"
      title={editing === null ? 'Nuevo proveedor' : 'Editar proveedor'}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={name().trim() === '' || saving()} onClick={save}>
            {editing === null ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
      <div class={forms.form}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Nombre</span>
          <input class={forms.input} value={name()} onInput={(event) => setName(event.currentTarget.value)} />
        </div>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Teléfono (opcional)</span>
            <input class={forms.input} value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Notas (opcional)</span>
            <input
              class={forms.input}
              value={notes()}
              onInput={(event) => setNotes(event.currentTarget.value)}
              placeholder="p. ej. visita los martes"
            />
          </div>
        </div>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Días de visita (alimentan la sugerencia de órdenes)</span>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <For each={DIAS}>
              {(day) => (
                <button
                  type="button"
                  class={visitDays().includes(day.key) ? forms.primario : forms.secundario}
                  style={{ 'min-width': '52px', padding: '8px 10px' }}
                  aria-pressed={visitDays().includes(day.key)}
                  onClick={() => toggleDay(day.key)}
                >
                  {day.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Persona de contacto (opcional)</span>
            <input
              class={forms.input}
              value={contactName()}
              onInput={(event) => setContactName(event.currentTarget.value)}
              placeholder="p. ej. Sr. Julio"
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Condiciones de pago (opcional)</span>
            <input
              class={forms.input}
              value={paymentTerms()}
              onInput={(event) => setPaymentTerms(event.currentTarget.value)}
              placeholder="p. ej. contado / crédito 15 días"
            />
          </div>
        </div>
        <Show when={editing !== null}>
          <label class={forms.check}>
            <input type="checkbox" checked={active()} onChange={(event) => setActive(event.currentTarget.checked)} />
            Activo
          </label>
        </Show>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};

export const SuppliersTab: Component = () => {
  const [suppliers, { refetch }] = createResource(listSuppliers);
  type ModalState =
    | { kind: 'none' }
    | { kind: 'create' }
    | { kind: 'edit'; supplier: SupplierDto }
    | { kind: 'products'; supplier: SupplierDto };
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  function closeAndRefresh(message: string): void {
    setModal({ kind: 'none' });
    showNotice(message);
    void refetch();
  }

  return (
    <section class={styles.vista}>
      <div class={styles.encabezado}>
        <span class={styles.sub} style={{ flex: '1' }}>
          Asocia productos desde el botón «Productos» de cada proveedor, o desde Productos →
          Editar.
        </span>
        <button type="button" class={styles.nuevo} onClick={() => setModal({ kind: 'create' })}>
          + Nuevo proveedor
        </button>
      </div>

      <div class={styles.tablaContenedor}>
        <table class={styles.tabla}>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Teléfono</th>
              <th>Visita</th>
              <th>Contacto</th>
              <th>Notas</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={suppliers() ?? []}>
              {(supplier) => (
                <tr classList={{ [styles.inactivo]: !supplier.active }}>
                  <td class={styles.nombre}>{supplier.name}</td>
                  <td class={styles.sub}>{supplier.phone ?? '—'}</td>
                  <td class={styles.sub}>
                    {supplier.visitDays.length === 0 ? '—' : supplier.visitDays.join(', ')}
                  </td>
                  <td class={styles.sub}>{supplier.contactName ?? '—'}</td>
                  <td class={styles.sub}>{supplier.notes ?? '—'}</td>
                  <td>
                    <Chip tone={supplier.active ? 'exito' : 'neutro'}>
                      {supplier.active ? 'activo' : 'inactivo'}
                    </Chip>
                  </td>
                  <td class={styles.acciones}>
                    <button type="button" onClick={() => setModal({ kind: 'edit', supplier })}>
                      Editar
                    </button>
                    <button
                      type="button"
                      title="Qué productos se le compran a este proveedor"
                      onClick={() => setModal({ kind: 'products', supplier })}
                    >
                      Productos
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!suppliers.loading && (suppliers() ?? []).length === 0}>
          <EmptyState
            message="Aún no hay proveedores."
            action={
              <button
                type="button"
                class={styles.nuevo}
                onClick={() => setModal({ kind: 'create' })}
              >
                + Crear el primer proveedor
              </button>
            }
          />
        </Show>
      </div>
      <TableFooter
        total={(suppliers() ?? []).length}
        singular="proveedor"
        plural="proveedores"
      />

      <Show when={modal().kind !== 'none'}>
        {(() => {
          const state = modal();
          if (state.kind === 'products') {
            return (
              <SupplierProductsModal
                supplier={state.supplier}
                onClose={() => setModal({ kind: 'none' })}
              />
            );
          }
          return (
            <SupplierFormModal
              supplier={state.kind === 'edit' ? state.supplier : null}
              onDone={closeAndRefresh}
              onClose={() => setModal({ kind: 'none' })}
            />
          );
        })()}
      </Show>
    </section>
  );
};

// Catálogo del proveedor: asociar/desasociar en lote sin pasar por cada
// producto. El buscador de la orden de compra solo ofrece lo asociado aquí.
const SupplierProductsModal: Component<{
  supplier: SupplierDto;
  onClose: () => void;
}> = (props) => {
  const [version, setVersion] = createSignal(0);
  const [bulkCategory, setBulkCategory] = createSignal('');
  const [linkingBulk, setLinkingBulk] = createSignal(false);

  const [linked, { refetch }] = createResource(version, () =>
    searchProducts('', null, true, false, props.supplier.id),
  );

  async function add(product: ProductDto): Promise<void> {
    try {
      await linkProductSupplier(product.id, props.supplier.id);
      beepOk();
      setVersion((value) => value + 1);
      void refetch();
    } catch {
      beepError();
    }
  }

  async function remove(product: ProductDto): Promise<void> {
    try {
      await unlinkProductSupplier(product.id, props.supplier.id);
      beepOk();
      setVersion((value) => value + 1);
      void refetch();
    } catch {
      beepError();
    }
  }

  // Asociar de a uno mil productos no es viable: una categoría de un golpe.
  async function addCategory(): Promise<void> {
    if (bulkCategory() === '' || linkingBulk()) return;
    setLinkingBulk(true);
    try {
      const result = await linkProductsToSupplier(props.supplier.id, { category: bulkCategory() });
      beepOk();
      showNotice(
        `${result.linkedCount} productos de «${bulkCategory()}» quedaron asociados a ${props.supplier.name}`,
      );
      setBulkCategory('');
      setVersion((value) => value + 1);
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo asociar la categoría.'));
    } finally {
      setLinkingBulk(false);
    }
  }

  return (
    <Modal
      size="lg"
      title={`Productos de ${props.supplier.name}`}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Listo
          </button>
        </div>
      }
    >
      <div class={forms.form}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Asociar producto (nombre, o escanea el código y Enter)</span>
          <ProductPicker
            placeholder="busca por nombre o escanea el código"
            includeInactive
            accept={(product) => !(linked() ?? []).some((item) => item.id === product.id)}
            meta={(product) => product.barcode ?? 'sin código'}
            onPick={(product) => void add(product)}
          />
        </div>

        <div class={forms.campo}>
          <span class={forms.etiqueta}>O asocia una categoría entera de una vez</span>
          <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
            <select
              id="asociar-categoria"
              class={forms.select}
              style={{ flex: '1', 'min-width': '180px' }}
              value={bulkCategory()}
              onChange={(event) => setBulkCategory(event.currentTarget.value)}
            >
              <option value="">— Elige categoría —</option>
              <For each={allCategories()}>
                {(item) => <option value={item.slug}>{item.name}</option>}
              </For>
            </select>
            <button
              type="button"
              class={forms.secundario}
              disabled={bulkCategory() === '' || linkingBulk()}
              onClick={() => void addCategory()}
            >
              Asociar categoría
            </button>
          </div>
        </div>

        <p class={forms.nota}>
          {(linked() ?? []).length === 0
            ? 'Este proveedor aún no tiene productos asociados: asócialos arriba para poder armarle órdenes de compra.'
            : 'Solo estos aparecen al armarle una orden de compra.'}
        </p>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <For each={linked() ?? []}>
            {(product) => (
              <SupplyRow
                product={product}
                supplierId={props.supplier.id}
                version={version()}
                onRemove={() => void remove(product)}
              />
            )}
          </For>
        </div>
        <TableFooter
          total={(linked() ?? []).length}
          singular="producto asociado"
          plural="productos asociados"
        />
      </div>
    </Modal>
  );
};

// Condiciones de este proveedor para un producto: su costo y su empaque, que
// no tienen por qué coincidir con los de otro proveedor del mismo producto.
const SupplyRow: Component<{
  product: ProductDto;
  supplierId: string;
  version: number;
  onRemove: () => void;
}> = (props) => {
  const [supply, { refetch }] = createResource(
    () => props.version,
    async (): Promise<ProductSupplyDto | null> => {
      const all = await listProductSupplies(props.product.id);
      return all.find((item) => item.supplierId === props.supplierId) ?? null;
    },
  );
  const [editing, setEditing] = createSignal(false);
  const [cost, setCost] = createSignal('');
  const [packSize, setPackSize] = createSignal('');
  const [packCost, setPackCost] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');

  const isWeight = () => props.product.saleType === 'weight';
  const costLabel = () => (isWeight() ? 'Costo/kg S/' : 'Costo/unidad S/');

  function startEditing(): void {
    const current = supply();
    setCost(current?.unitCostCents == null ? '' : centsToSolesInput(current.unitCostCents));
    setPackSize(current?.packSize == null ? '' : String(current.packSize));
    setPackCost(current?.packCostCents == null ? '' : centsToSolesInput(current.packCostCents));
    setError('');
    setEditing(true);
  }

  async function save(): Promise<void> {
    if (saving()) return;
    const unitCostCents = solesInputToCents(cost());
    const size = Number.parseInt(packSize(), 10) || null;
    const packCostCents = solesInputToCents(packCost());
    if ((size === null) !== (packCostCents === null)) {
      setError('El empaque va completo: unidades por caja y costo por caja, o ninguno.');
      return;
    }
    if (size !== null && unitCostCents === null) {
      setError('Para cargar el empaque hace falta el costo de este proveedor.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveProductSupply(props.product.id, props.supplierId, {
        unitCostCents,
        packSize: isWeight() ? null : size,
        packCostCents: isWeight() ? null : packCostCents,
        supplierSku: null,
        preferred: false,
      });
      beepOk();
      setEditing(false);
      void refetch();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudieron guardar las condiciones.'));
    } finally {
      setSaving(false);
    }
  }

  const resumen = () => {
    const current = supply();
    if (current == null || current.unitCostCents == null) return 'sin costo cargado';
    const unidad = isWeight() ? '/kg' : 'c/u';
    const caja =
      current.packSize == null || current.packCostCents == null
        ? ''
        : ` · caja ×${current.packSize} a ${formatSoles(current.packCostCents)}`;
    return `${formatSoles(current.unitCostCents)} ${unidad}${caja}`;
  };

  return (
    <div style={{ 'border-bottom': '1px dashed var(--linea)', padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '8px',
          'flex-wrap': 'wrap',
        }}
      >
        <div>
          <div>
            {props.product.name}
            {props.product.active ? '' : ' (inactivo)'}
          </div>
          <div class={forms.nota} style={{ margin: '0' }}>
            {resumen()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" class={forms.secundario} onClick={startEditing}>
            Condiciones
          </button>
          <button type="button" class={forms.secundario} onClick={props.onRemove}>
            Quitar
          </button>
        </div>
      </div>

      <Show when={editing()}>
        <div class={forms.fila} style={{ 'margin-top': '8px' }}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>{costLabel()}</span>
            <input
              id={`costo-${props.product.id}`}
              class={forms.input}
              type="number"
              step="0.10"
              min="0"
              value={cost()}
              onInput={(event) => setCost(event.currentTarget.value)}
            />
          </div>
          <Show when={!isWeight()}>
            <div class={forms.campo}>
              <span class={forms.etiqueta}>Unidades por caja</span>
              <input
                id={`caja-${props.product.id}`}
                class={forms.input}
                type="number"
                min="1"
                value={packSize()}
                onInput={(event) => setPackSize(event.currentTarget.value)}
              />
            </div>
            <div class={forms.campo}>
              <span class={forms.etiqueta}>Costo por caja S/</span>
              <input
                id={`costo-caja-${props.product.id}`}
                class={forms.input}
                type="number"
                step="0.10"
                min="0"
                value={packCost()}
                onInput={(event) => setPackCost(event.currentTarget.value)}
              />
            </div>
          </Show>
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={saving()} onClick={save}>
            Guardar condiciones
          </button>
        </div>
      </Show>
    </div>
  );
};
