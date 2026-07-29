import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { createSupplier, listSuppliers, updateSupplier } from '@/shared/api/suppliers';
import { showNotice } from '@/shared/state/notices';
import type { SupplierDto } from '@/shared/types';
import { Modal } from '@/shared/ui/Modal';
import styles from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

const SupplierFormModal: Component<{
  supplier: SupplierDto | null;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.supplier;
  const [name, setName] = createSignal(editing?.name ?? '');
  const [phone, setPhone] = createSignal(editing?.phone ?? '');
  const [notes, setNotes] = createSignal(editing?.notes ?? '');
  const [active, setActive] = createSignal(editing?.active ?? true);
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    if (name().trim() === '') return;
    const payload = {
      name: name().trim(),
      phone: phone().trim() === '' ? null : phone().trim(),
      notes: notes().trim() === '' ? null : notes().trim(),
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
    } catch {
      setError('No se pudo guardar el proveedor.');
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
          <button type="button" class={forms.primario} disabled={name().trim() === ''} onClick={save}>
            {editing === null ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const SuppliersTab: Component = () => {
  const [suppliers, { refetch }] = createResource(listSuppliers);
  type ModalState = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; supplier: SupplierDto };
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
          Los proveedores se asignan a cada producto desde Productos → Editar.
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
                  <td class={styles.sub}>{supplier.notes ?? '—'}</td>
                  <td class={styles.sub}>{supplier.active ? 'activo' : 'inactivo'}</td>
                  <td class={styles.acciones}>
                    <button type="button" onClick={() => setModal({ kind: 'edit', supplier })}>
                      Editar
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!suppliers.loading && (suppliers() ?? []).length === 0}>
          <p class={styles.vacio}>Aún no hay proveedores. Crea el primero.</p>
        </Show>
      </div>

      <Show when={modal().kind !== 'none'}>
        {(() => {
          const state = modal();
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
