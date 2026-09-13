import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { createCustomer, listCustomers } from '@/shared/api/customers';
import { apiErrorMessage } from '@/shared/api/client';
import { formatSoles } from '@/shared/lib/money';
import { Modal } from '@/shared/ui/Modal';
import type { TicketCustomer } from '@/features/sale/state/ticket';
import forms from '@/shared/ui/forms.module.css';
import styles from './CreditChargeModal.module.css';

// Poner la venta a nombre de un cliente (cualquiera, no solo fiado): la misma
// libreta de clientes, sin chequeo de crédito porque aquí no se fía nada.
// Si el cliente no existe, se crea aquí mismo (nombre y teléfono bastan) —
// abandonar la venta para ir al módulo Clientes rompía el flujo de mostrador.
export const CustomerPickModal: Component<{
  onPick: (customer: TicketCustomer) => void;
  onClear: () => void;
  hasCustomer: boolean;
  onClose: () => void;
}> = (props) => {
  const [query, setQuery] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [newPhone, setNewPhone] = createSignal('');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [customers] = createResource(query, (search) => listCustomers(search, false));

  async function saveNew(): Promise<void> {
    const name = newName().trim();
    if (name === '' || saving()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createCustomer({
        name,
        phone: newPhone().trim() === '' ? null : newPhone().trim(),
        document: null,
        // Mismo límite por defecto que el alta del módulo Clientes.
        creditLimitCents: 5000,
      });
      props.onPick({ id: created.id, name });
    } catch (cause) {
      setError(apiErrorMessage(cause, 'No se pudo crear el cliente.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="md"
      title="Cliente de la venta"
      onClose={props.onClose}
      footer={
        <Show
          when={!creating()}
          fallback={
            <div class={forms.acciones}>
              <button type="button" class={forms.secundario} onClick={() => setCreating(false)}>
                Volver
              </button>
              <button
                type="button"
                class={forms.primario}
                disabled={newName().trim() === '' || saving()}
                onClick={() => void saveNew()}
              >
                {saving() ? 'Creando…' : 'Crear y asignar'}
              </button>
            </div>
          }
        >
          <div class={forms.acciones}>
            <button
              type="button"
              class={forms.secundario}
              onClick={() => {
                setNewName(query().trim());
                setCreating(true);
              }}
            >
              + Nuevo cliente
            </button>
            <Show when={props.hasCustomer}>
              <button type="button" class={forms.secundario} onClick={props.onClear}>
                Quitar cliente
              </button>
            </Show>
            <button type="button" class={forms.secundario} onClick={props.onClose}>
              Cerrar
            </button>
          </div>
        </Show>
      }
    >
      <div class={styles.cuerpo}>
        <Show
          when={!creating()}
          fallback={
            <div class={forms.form}>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Nombre</span>
                <input
                  class={forms.input}
                  value={newName()}
                  onInput={(event) => setNewName(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void saveNew()}
                  autofocus
                />
              </div>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Teléfono (opcional)</span>
                <input
                  class={forms.input}
                  type="tel"
                  value={newPhone()}
                  onInput={(event) => setNewPhone(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void saveNew()}
                />
              </div>
              <Show when={error() !== ''}>
                <p class={forms.error}>{error()}</p>
              </Show>
            </div>
          }
        >
          <input
            class={styles.buscador}
            type="text"
            placeholder="Buscar cliente…"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            autofocus
          />

          <div class={styles.lista}>
            <For each={customers() ?? []}>
              {(customer) => (
                <button
                  type="button"
                  class={styles.cliente}
                  onClick={() => props.onPick({ id: customer.id, name: customer.name })}
                >
                  <span class={styles.nombre}>{customer.name}</span>
                  <Show when={customer.balanceCents > 0}>
                    <span class={styles.detalle}>Debe {formatSoles(customer.balanceCents)}</span>
                  </Show>
                </button>
              )}
            </For>
            <Show when={!customers.loading && (customers() ?? []).length === 0}>
              <p class={styles.vacio}>No hay clientes con ese nombre.</p>
            </Show>
          </div>

        </Show>
      </div>
    </Modal>
  );
};
