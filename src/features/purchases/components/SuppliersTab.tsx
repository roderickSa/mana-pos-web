import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { linkProductSupplier, searchProducts, unlinkProductSupplier } from '@/shared/api/products';
import { ProductPicker } from '@/shared/ui/ProductPicker';
import { createSupplier, listSuppliers, updateSupplier } from '@/shared/api/suppliers';
import { beepError, beepOk } from '@/shared/lib/sounds';
import type { ProductDto } from '@/shared/types';
import { showNotice } from '@/shared/state/notices';
import type { SupplierDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
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
    <Modal title={editing === null ? 'Nuevo proveedor' : 'Editar proveedor'} onClose={props.onClose}>
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
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={name().trim() === '' || saving()} onClick={save}>
            {editing === null ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
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
                  <td class={styles.sub}>{supplier.active ? 'activo' : 'inactivo'}</td>
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
          <div class={styles.vacio}>
            <p>Aún no hay proveedores.</p>
            <button type="button" class={styles.nuevo} onClick={() => setModal({ kind: 'create' })}>
              + Crear el primer proveedor
            </button>
          </div>
        </Show>
      </div>

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

  return (
    <Modal size="lg" title={`Productos de ${props.supplier.name}`} onClose={props.onClose}>
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

        <p class={forms.nota}>
          {(linked() ?? []).length === 0
            ? 'Este proveedor aún no tiene productos asociados: asócialos arriba para poder armarle órdenes de compra.'
            : `${(linked() ?? []).length} productos asociados — solo estos aparecen al armarle una orden de compra.`}
        </p>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <For each={linked() ?? []}>
            {(product) => (
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'space-between',
                  gap: '8px',
                  'border-bottom': '1px dashed var(--linea)',
                  padding: '6px 0',
                }}
              >
                <span>
                  {product.name}
                  {product.active ? '' : ' (inactivo)'}
                </span>
                <button
                  type="button"
                  class={forms.secundario}
                  onClick={() => void remove(product)}
                >
                  Quitar
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Modal>
  );
};
